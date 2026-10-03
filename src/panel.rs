use crate::{
    agent::{Rpc, ServerAction, ServerQuery},
    auth::{self, Principal, Session, TokenInput, TokenRecord},
    catalog::Catalog,
    config::Config,
    error::{Error, Result, require},
    models::{Node, Server, ServerInput, Snapshot, valid_id},
    scheduler::{self, Task, TaskInput},
    store::{Store, now},
    templates,
};
use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{ConnectInfo, DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use dashmap::DashMap;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};

#[derive(Clone)]
pub struct Panel {
    pub config: Arc<Config>,
    pub store: Store,
    pub catalog: Catalog,
    pub client: reqwest::Client,
    login_attempts: Arc<DashMap<String, (i64, u32)>>,
}

impl Panel {
    pub fn new(config: Config) -> Result<Self> {
        let store = Store::open(&config.data_dir)?;
        if !config.agent_token.is_empty() && store.get::<Node>("node", "local")?.is_none() {
            store.put(
                "node",
                "local",
                &Node {
                    id: "local".into(),
                    name: config.node_name.clone(),
                    url: config.agent_url.clone(),
                    token: config.agent_token.clone(),
                    public_host: config.public_host.clone(),
                    sftp_port: config
                        .sftp_listen
                        .parse::<std::net::SocketAddr>()
                        .map_err(anyhow::Error::from)?
                        .port(),
                },
            )?;
        }
        Ok(Self {
            catalog: Catalog::new(&config)?,
            client: config.http_client()?,
            config: Arc::new(config),
            store,
            login_attempts: Arc::new(DashMap::new()),
        })
    }
    pub fn server(&self, id: &str) -> Result<Server> {
        valid_id(id)?;
        self.store.need("server", id)
    }
    pub async fn rpc(&self, node_id: &str, rpc: &Rpc) -> Result<Value> {
        let node: Node = self.store.need("node", node_id)?;
        let response = self
            .client
            .post(format!("{}/v1/rpc", node.url.trim_end_matches('/')))
            .bearer_auth(&node.token)
            .json(rpc)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        let status = response.status();
        let bytes = crate::catalog::bounded_bytes(response, 48 * 1024 * 1024).await?;
        let value: Value = serde_json::from_slice(&bytes)?;
        if status.is_success() {
            return Ok(value);
        }
        let message = value["error"]
            .as_str()
            .unwrap_or("Node request failed")
            .to_owned();
        Err(match status.as_u16() {
            400 => Error::bad(message),
            403 => Error::Forbidden(message),
            404 => Error::not_found(message),
            409 => Error::Conflict(message),
            _ => Error::Upstream(message),
        })
    }
    pub async fn server_query(&self, server: &Server, query: ServerQuery) -> Result<Value> {
        self.rpc(
            &server.config.node_id,
            &Rpc::Query {
                server_id: server.id.clone(),
                query,
            },
        )
        .await
    }
    pub async fn perform(
        &self,
        server: &Server,
        action: ServerAction,
        principal: &Principal,
    ) -> Result<Value> {
        principal.allow(action.permission(), Some(&server.id))?;
        if let ServerAction::Diagnose { options } = &action
            && options.apply_fix
        {
            principal.allow("packages.write", Some(&server.id))?;
            principal.allow("backups.write", Some(&server.id))?;
        }
        let label = action.label();
        let result = self
            .rpc(
                &server.config.node_id,
                &Rpc::Action {
                    server_id: server.id.clone(),
                    action,
                },
            )
            .await?;
        self.store.audit(
            &principal.name,
            label,
            Some(&server.id),
            &server.config.name,
        )?;
        Ok(result)
    }
    pub fn view(&self, server: &Server) -> Result<Value> {
        let mut value = serde_json::to_value(server)?;
        let observation = self
            .store
            .get::<Value>("observation", &server.id)?
            .unwrap_or(json!({"snapshot":Snapshot::offline(&server.config.motd),"history":[]}));
        value["snapshot"] = observation["snapshot"].clone();
        value["history"] = observation["history"].clone();
        if value["snapshot"]["at"]
            .as_i64()
            .is_none_or(|at| at < now() - 45)
        {
            value["snapshot"]["state"] = json!("unreachable");
            value["snapshot"]["players"] = Value::Null;
            value["snapshot"]["error"] = json!("Waiting for a fresh node observation");
        }
        if let Some(node) = self.store.get::<Node>("node", &server.config.node_id)? {
            value["node_name"] = json!(node.name);
            value["address"] = json!(format!("{}:{}", node.public_host, server.config.port));
        }
        Ok(value)
    }
}

pub fn router(panel: Panel) -> Router {
    let protected = Router::new()
        .route("/auth/me", get(me))
        .route("/auth/logout", post(logout))
        .route("/overview", get(overview))
        .route("/deployment", get(deployment))
        .route("/servers", get(servers).post(create_server))
        .route(
            "/servers/{id}",
            get(server).put(update_server).delete(delete_server),
        )
        .route("/servers/{id}/actions", post(action))
        .route("/servers/{id}/tasks", get(tasks).post(save_task))
        .route(
            "/servers/{id}/tasks/{task_id}",
            delete(delete_task).put(update_task),
        )
        .route(
            "/servers/{id}/backups/{backup_id}/download",
            get(download_backup),
        )
        .route("/servers/{id}/{resource}", get(resource))
        .route("/nodes", get(nodes).post(add_node))
        .route("/nodes/{id}", delete(delete_node))
        .route("/tokens", get(tokens).post(issue_token))
        .route("/tokens/{id}", delete(revoke_token))
        .route(
            "/templates",
            get(|| async { Json(json!({"templates":templates::all()})) }),
        )
        .route("/catalog/versions", get(core_versions))
        .route("/catalog/loaders", get(loader_versions))
        .route("/catalog/search", get(search))
        .route("/catalog/project/{project}", get(project_versions))
        .route("/catalog/github", get(github_releases))
        .route("/assistant", post(crate::assistant::chat))
        .route_layer(middleware::from_fn_with_state(panel.clone(), protect));
    Router::new()
        .nest("/api", protected)
        .route("/api/auth/login", post(login))
        .route(
            "/healthz",
            get(|State(panel): State<Panel>| async move {
                Json(json!({"ok":true,"service":"emberdeck","version":env!("CARGO_PKG_VERSION"),"installation_id":crate::access::installation_id(&panel.config)}))
            }),
        )
        .fallback(crate::web::asset)
        .layer(DefaultBodyLimit::max(48 * 1024 * 1024))
        .layer(middleware::from_fn(crate::web::headers))
        .with_state(panel)
}

async fn deployment(
    State(panel): State<Panel>,
    Extension(principal): Extension<Principal>,
) -> Result<Json<Value>> {
    principal.admin()?;
    Ok(Json(crate::access::view(&panel.config)?))
}

async fn protect(State(panel): State<Panel>, mut request: Request, next: Next) -> Result<Response> {
    let principal = auth::authenticate(
        &auth::ConfigStore {
            db: &panel.store,
            config: &panel.config,
        },
        request.headers(),
    )?;
    if !matches!(request.method().as_str(), "GET" | "HEAD" | "OPTIONS") {
        auth::check_csrf(request.headers(), &panel.config)?;
    }
    request.extensions_mut().insert(principal);
    Ok(next.run(request).await)
}

#[derive(Deserialize)]
struct Login {
    token: String,
}

async fn login(
    State(panel): State<Panel>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(input): Json<Login>,
) -> Result<Response> {
    require(input.token.len() <= 256, "Invalid token")?;
    if headers.contains_key("origin") {
        auth::check_csrf(&headers, &panel.config)?;
    }
    let key = crate::access::client_ip(peer.ip(), &headers, panel.config.access_mode).to_string();
    panel.login_attempts.retain(|_, (at, _)| *at > now() - 300);
    {
        let mut attempts = panel
            .login_attempts
            .entry(key.clone())
            .or_insert((now(), 0));
        if attempts.1 >= 10 {
            return Err(Error::RateLimited);
        }
        attempts.1 += 1;
    }
    let principal = auth::from_hash(&panel.store, &panel.config, &auth::digest(&input.token))?;
    panel.login_attempts.remove(&key);
    let token = auth::new_secret();
    panel.store.put(
        "session",
        &auth::digest(&token),
        &Session {
            token_hash: principal.token_hash.clone(),
            expires_at: now() + 43200,
        },
    )?;
    panel
        .store
        .audit(&principal.name, "Signed in", None, "Web session")?;
    let secure = if panel.config.secure_cookies() {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "emberdeck_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200{secure}"
    );
    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(json!({"user":principal})),
    )
        .into_response())
}

async fn me(State(panel): State<Panel>, Extension(principal): Extension<Principal>) -> Json<Value> {
    Json(
        json!({"user":principal,"assistant_configured":!panel.config.ai_api_key.is_empty(),"version":env!("CARGO_PKG_VERSION")}),
    )
}
async fn logout(State(panel): State<Panel>, headers: HeaderMap) -> Result<Response> {
    if let Some(token) = auth::cookie(&headers) {
        panel.store.delete("session", &auth::digest(token))?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            "emberdeck_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        )],
        Json(json!({"ok":true})),
    )
        .into_response())
}
async fn servers(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
) -> Result<Json<Value>> {
    let servers = panel
        .store
        .list::<Server>("server")?
        .iter()
        .filter(|s| p.allow("server.read", Some(&s.id)).is_ok())
        .map(|s| panel.view(s))
        .collect::<Result<Vec<_>>>()?;
    Ok(Json(json!({"servers":servers})))
}
async fn overview(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
) -> Result<Json<Value>> {
    let servers = panel
        .store
        .list::<Server>("server")?
        .iter()
        .filter(|s| p.allow("server.read", Some(&s.id)).is_ok())
        .map(|s| panel.view(s))
        .collect::<Result<Vec<_>>>()?;
    let activity = panel
        .store
        .list::<Value>("activity")?
        .into_iter()
        .filter(|e| {
            e["server_id"]
                .as_str()
                .map_or(p.is_admin(), |id| p.can_see(id))
        })
        .take(25)
        .collect::<Vec<_>>();
    let tasks = panel
        .store
        .list::<Task>("task")?
        .into_iter()
        .filter(|t| p.allow("tasks.read", Some(&t.server_id)).is_ok())
        .map(|t| t.public())
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"servers":servers,"activity":activity,"tasks":tasks,"at":now()}),
    ))
}
async fn server(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    p.allow("server.read", Some(&id))?;
    Ok(Json(panel.view(&panel.server(&id)?)?))
}

async fn create_server(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Json(config): Json<ServerInput>,
) -> Result<(StatusCode, Json<Value>)> {
    p.admin()?;
    config.validate()?;
    let _: Node = panel.store.need("node", &config.node_id)?;
    let version_list = panel.catalog.versions(&config.template).await?;
    require(
        version_list["versions"]
            .as_array()
            .is_some_and(|versions| versions.iter().any(|v| v == &config.version)),
        "This Minecraft version is not published for the selected core",
    )?;
    let server = Server {
        id: uuid::Uuid::new_v4().to_string(),
        config,
        created_at: now(),
    };
    if let Some(project) = &server.config.modpack {
        let metadata = panel
            .catalog
            .json(&format!("https://api.modrinth.com/v2/project/{project}"))
            .await?;
        require(
            metadata["project_type"] == "modpack" && metadata["server_side"] != "unsupported",
            "Choose a Modrinth modpack which supports dedicated servers",
        )?;
        let versions = panel
            .catalog
            .project_versions(&server, "modpack", project)
            .await?;
        require(
            versions
                .as_array()
                .is_some_and(|versions| !versions.is_empty()),
            "This modpack has no published version for the selected Minecraft version and loader",
        )?;
    }
    panel
        .rpc(
            &server.config.node_id,
            &Rpc::Create {
                server: server.clone(),
            },
        )
        .await?;
    panel.store.put("server", &server.id, &server)?;
    panel.store.audit(
        &p.name,
        "Server created",
        Some(&server.id),
        &server.config.name,
    )?;
    Ok((StatusCode::CREATED, Json(panel.view(&server)?)))
}
async fn update_server(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
    Json(config): Json<ServerInput>,
) -> Result<Json<Value>> {
    p.admin()?;
    config.validate()?;
    let old = panel.server(&id)?;
    require(
        config.node_id == old.config.node_id,
        "Node migration requires copying the server data first",
    )?;
    let server = Server { config, ..old };
    panel
        .rpc(
            &server.config.node_id,
            &Rpc::Update {
                server: server.clone(),
            },
        )
        .await?;
    panel.store.put("server", &id, &server)?;
    panel.store.audit(
        &p.name,
        "Server configuration changed",
        Some(&id),
        &server.config.name,
    )?;
    Ok(Json(panel.view(&server)?))
}
#[derive(Deserialize)]
struct Confirmation {
    confirmation: String,
}
async fn delete_server(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
    Json(input): Json<Confirmation>,
) -> Result<Json<Value>> {
    p.admin()?;
    let server = panel.server(&id)?;
    let result = panel
        .rpc(
            &server.config.node_id,
            &Rpc::Delete {
                server_id: id.clone(),
                confirmation: input.confirmation,
            },
        )
        .await?;
    panel.store.delete("server", &id)?;
    for task in panel
        .store
        .list::<Task>("task")?
        .into_iter()
        .filter(|t| t.server_id == id)
    {
        panel.store.delete("task", &task.id)?;
    }
    panel.store.audit(
        &p.name,
        "Server removed",
        Some(&id),
        "Server files archived on node",
    )?;
    Ok(Json(result))
}
async fn action(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
    Json(action): Json<ServerAction>,
) -> Result<Json<Value>> {
    let server = panel.server(&id)?;
    let mut result = panel.perform(&server, action, &p).await?;
    if result.get("password").is_some() {
        let node: Node = panel.store.need("node", &server.config.node_id)?;
        result["host"] = json!(node.public_host);
        result["port"] = json!(node.sftp_port);
    }
    Ok(Json(result))
}
async fn resource(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path((id, resource)): Path<(String, String)>,
    Query(args): Query<BTreeMap<String, String>>,
) -> Result<Json<Value>> {
    let path = args.get("path").cloned().unwrap_or_else(|| "/".into());
    let query = match resource.as_str() {
        "logs" => ServerQuery::Logs {
            tail: args.get("tail").and_then(|v| v.parse().ok()).unwrap_or(400),
        },
        "files" => ServerQuery::Files { path },
        "file" => ServerQuery::File { path },
        "packages" => ServerQuery::Packages,
        "backups" => ServerQuery::Backups,
        "jobs" => ServerQuery::Jobs,
        "scan" => ServerQuery::Scan,
        "analysis" => ServerQuery::Analysis,
        _ => return Err(Error::not_found("Unknown resource")),
    };
    p.allow(query.permission(), Some(&id))?;
    Ok(Json(panel.server_query(&panel.server(&id)?, query).await?))
}

async fn nodes(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
) -> Result<Json<Value>> {
    p.admin()?;
    let nodes = panel
        .store
        .list::<Node>("node")?
        .iter()
        .map(|node| {
            let mut view = node.public();
            view["info"] = panel
                .store
                .get::<Value>("node_info", &node.id)?
                .unwrap_or(Value::Null);
            Ok(view)
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Json(json!({"nodes":nodes})))
}
#[derive(Deserialize)]
struct NodeInput {
    name: String,
    url: String,
    token: String,
    public_host: String,
    sftp_port: u16,
}
async fn add_node(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Json(input): Json<NodeInput>,
) -> Result<Json<Value>> {
    p.admin()?;
    let url = reqwest::Url::parse(&input.url).map_err(|_| Error::bad("Invalid agent URL"))?;
    require(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "Use an agent origin without credentials or query parameters",
    )?;
    let local = url.host_str().is_some_and(|h| {
        h == "localhost"
            || h.parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    require(
        url.scheme() == "https" || (url.scheme() == "http" && local),
        "Remote agents require HTTPS; local SSH tunnels may use HTTP",
    )?;
    require(
        input.token.len() >= 32
            && input.token.len() <= 256
            && !input.name.is_empty()
            && input.name.len() <= 80,
        "Invalid node name or token",
    )?;
    let node = Node {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name,
        url: url.to_string().trim_end_matches('/').into(),
        token: input.token,
        public_host: input.public_host,
        sftp_port: input.sftp_port,
    };
    panel.store.put("node", &node.id, &node)?;
    match panel.rpc(&node.id, &Rpc::Info).await {
        Ok(info) => panel.store.put("node_info", &node.id, &info)?,
        Err(error) => {
            panel.store.delete("node", &node.id)?;
            return Err(error);
        }
    }
    panel
        .store
        .audit(&p.name, "Node connected", None, &node.name)?;
    Ok(Json(node.public()))
}
async fn delete_node(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    p.admin()?;
    require(
        !panel
            .store
            .list::<Server>("server")?
            .iter()
            .any(|s| s.config.node_id == id),
        "Move or remove this node's servers first",
    )?;
    panel.store.delete("node", &id)?;
    Ok(Json(json!({"ok":true})))
}

fn token_view(record: &TokenRecord) -> Value {
    json!({"id":record.id,"name":record.name,"role":record.role,"server_ids":record.server_ids,"permissions":record.permissions,"expires_at":record.expires_at,"created_at":record.created_at})
}
async fn tokens(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
) -> Result<Json<Value>> {
    p.admin()?;
    Ok(Json(
        json!({"tokens":panel.store.list::<TokenRecord>("token")?.iter().map(token_view).collect::<Vec<_>>()}),
    ))
}
async fn issue_token(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Json(input): Json<TokenInput>,
) -> Result<Json<Value>> {
    p.admin()?;
    let (secret, record) = auth::issue(&panel.store, input)?;
    panel
        .store
        .audit(&p.name, "Access token created", None, &record.name)?;
    Ok(Json(json!({"token":secret,"record":token_view(&record)})))
}
async fn revoke_token(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    p.admin()?;
    let record = panel
        .store
        .list::<TokenRecord>("token")?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| Error::not_found("Token not found"))?;
    panel.store.delete("token", &record.hash)?;
    panel
        .store
        .audit(&p.name, "Access token revoked", None, &record.name)?;
    Ok(Json(json!({"ok":true})))
}

async fn core_versions(
    State(panel): State<Panel>,
    Query(args): Query<BTreeMap<String, String>>,
) -> Result<Json<Value>> {
    Ok(Json(
        panel
            .catalog
            .versions(args.get("template").map(String::as_str).unwrap_or("paper"))
            .await?,
    ))
}
async fn loader_versions(
    State(panel): State<Panel>,
    Query(args): Query<BTreeMap<String, String>>,
) -> Result<Json<Value>> {
    Ok(Json(
        panel
            .catalog
            .loaders(required(&args, "template")?, required(&args, "version")?)
            .await?,
    ))
}
async fn search(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Query(args): Query<BTreeMap<String, String>>,
) -> Result<Json<Value>> {
    let id = required(&args, "server_id")?;
    p.allow("packages.read", Some(id))?;
    Ok(Json(
        panel
            .catalog
            .search(
                &panel.server(id)?,
                required(&args, "kind")?,
                args.get("q").map(String::as_str).unwrap_or(""),
            )
            .await?,
    ))
}
async fn project_versions(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(project): Path<String>,
    Query(args): Query<BTreeMap<String, String>>,
) -> Result<Json<Value>> {
    let id = required(&args, "server_id")?;
    p.allow("packages.read", Some(id))?;
    Ok(Json(
        json!({"versions":panel.catalog.project_versions(&panel.server(id)?,required(&args,"kind")?,&project).await?}),
    ))
}
async fn github_releases(
    State(panel): State<Panel>,
    Query(args): Query<BTreeMap<String, String>>,
) -> Result<Json<Value>> {
    Ok(Json(
        panel
            .catalog
            .github_releases(required(&args, "repository")?)
            .await?,
    ))
}
fn required<'a>(args: &'a BTreeMap<String, String>, key: &str) -> Result<&'a str> {
    args.get(key)
        .map(String::as_str)
        .ok_or_else(|| Error::bad(format!("Missing query parameter: {key}")))
}

async fn tasks(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    p.allow("tasks.read", Some(&id))?;
    Ok(Json(
        json!({"tasks":panel.store.list::<Task>("task")?.into_iter().filter(|t|t.server_id==id).map(|t|t.public()).collect::<Vec<_>>()}),
    ))
}
async fn save_task(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path(id): Path<String>,
    Json(input): Json<TaskInput>,
) -> Result<Json<Value>> {
    p.allow("tasks.write", Some(&id))?;
    p.allow(input.operation.permission(), Some(&id))?;
    panel.server(&id)?;
    input.validate()?;
    let task = Task::new(id, input, &p.token_hash)?;
    panel.store.put("task", &task.id, &task)?;
    panel.store.audit(
        &p.name,
        "Automation created",
        Some(&task.server_id),
        &task.input.name,
    )?;
    Ok(Json(task.public()))
}
async fn delete_task(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path((id, task_id)): Path<(String, String)>,
) -> Result<Json<Value>> {
    p.allow("tasks.write", Some(&id))?;
    let task: Task = panel.store.need("task", &task_id)?;
    require(task.server_id == id, "Task belongs to a different server")?;
    panel.store.delete("task", &task_id)?;
    Ok(Json(json!({"ok":true})))
}

async fn update_task(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path((id, task_id)): Path<(String, String)>,
    Json(input): Json<TaskInput>,
) -> Result<Json<Value>> {
    p.allow("tasks.write", Some(&id))?;
    p.allow(input.operation.permission(), Some(&id))?;
    input.validate()?;
    let mut task: Task = panel.store.need("task", &task_id)?;
    require(task.server_id == id, "Task belongs to a different server")?;
    task.next_run = input.next(now())?;
    task.input = input;
    task.owner_hash = p.token_hash.clone();
    panel.store.put("task", &task_id, &task)?;
    panel
        .store
        .audit(&p.name, "Automation updated", Some(&id), &task.input.name)?;
    Ok(Json(task.public()))
}

async fn download_backup(
    State(panel): State<Panel>,
    Extension(p): Extension<Principal>,
    Path((id, backup_id)): Path<(String, String)>,
) -> Result<Response> {
    p.allow("backups.read", Some(&id))?;
    valid_id(&backup_id)?;
    let server = panel.server(&id)?;
    let node: Node = panel.store.need("node", &server.config.node_id)?;
    let response = panel
        .client
        .get(format!(
            "{}/v1/backups/{id}/{backup_id}",
            node.url.trim_end_matches('/')
        ))
        .bearer_auth(node.token)
        .timeout(Duration::from_secs(3600))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(Error::Upstream(format!(
            "Backup download failed: {}",
            response.status()
        )));
    }
    let length = response.headers().get(header::CONTENT_LENGTH).cloned();
    let mut result = (
        [
            (header::CONTENT_TYPE, "application/gzip".to_owned()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{backup_id}.tar.gz\""),
            ),
        ],
        Body::from_stream(response.bytes_stream()),
    )
        .into_response();
    if let Some(length) = length {
        result.headers_mut().insert(header::CONTENT_LENGTH, length);
    }
    Ok(result)
}

pub async fn observe(panel: Panel) {
    let mut previous = HashMap::new();
    let mut cycle = 0;
    loop {
        if let Err(error) = observation_cycle(&panel, &mut previous, cycle).await {
            tracing::error!(%error,"Observation cycle failed");
        }
        cycle += 1;
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}
async fn observation_cycle(
    panel: &Panel,
    previous: &mut HashMap<String, Snapshot>,
    cycle: u64,
) -> Result<()> {
    use futures_util::{StreamExt, stream};
    if cycle.is_multiple_of(6) {
        for node in panel.store.list::<Node>("node")? {
            match panel.rpc(&node.id, &Rpc::Info).await {
                Ok(info) => panel.store.put("node_info", &node.id, &info)?,
                Err(error) => tracing::warn!(%error,node=%node.id,"Node info unavailable"),
            }
        }
    }
    let servers = panel.store.list::<Server>("server")?;
    let mut observations = stream::iter(servers.into_iter().map(|server| async move {
        let result = panel.server_query(&server, ServerQuery::Status).await;
        (server, result)
    }))
    .buffer_unordered(4);
    while let Some((server, result)) = observations.next().await {
        match result {
            Ok(value) => {
                panel.store.put("observation", &server.id, &value)?;
                let current: Snapshot = serde_json::from_value(value["snapshot"].clone())?;
                if current.at >= now() - 30 {
                    scheduler::tick(panel, &server, previous.get(&server.id), &current).await?;
                    previous.insert(server.id, current);
                }
            }
            Err(error) => tracing::warn!(%error,server=%server.id,"Node observation unavailable"),
        }
    }
    Ok(())
}

pub async fn serve(listen: &str, router: Router) -> anyhow::Result<()> {
    let listener = tokio::net::TcpListener::bind(listen).await?;
    tracing::info!(%listen,"HTTP listening");
    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::warn!(%error,"Shutdown signal unavailable");
        }
    })
    .await?;
    Ok(())
}
