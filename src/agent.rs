use crate::{
    auth,
    backups::{self, Backup},
    catalog::{self, Catalog, PackageInstall},
    config::Config,
    diagnostics::{self, DiagnoseInput},
    error::{Error, Result, require},
    files::{Files, WEB_FILE_LIMIT},
    jobs::{Job, Jobs},
    models::{Server, Snapshot, valid_id},
    runtime::Docker,
    security,
    store::{Store, now},
};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path as UrlPath, Request, State},
    http::header,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::Arc, time::Duration};

#[derive(Clone)]
pub struct Agent {
    pub config: Arc<Config>,
    pub store: Store,
    pub docker: Docker,
    pub catalog: Catalog,
    pub jobs: Jobs,
    capacity: Arc<tokio::sync::Mutex<()>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum ServerAction {
    Power {
        signal: PowerSignal,
    },
    Command {
        command: String,
    },
    WriteFile {
        path: String,
        content: String,
        #[serde(default)]
        expected_hash: Option<String>,
    },
    Upload {
        path: String,
        data: String,
    },
    RenameFile {
        from: String,
        to: String,
    },
    RemoveFile {
        path: String,
    },
    Mkdir {
        path: String,
    },
    TogglePackage {
        path: String,
        enabled: bool,
    },
    InstallPackage {
        #[serde(flatten)]
        package: PackageInstall,
    },
    InstallGithub {
        repository: String,
        asset_id: u64,
        kind: String,
        confirm_compatibility: bool,
    },
    Backup {
        #[serde(default = "local")]
        destination: String,
    },
    Restore {
        backup_id: String,
        confirm: bool,
    },
    Scan {
        #[serde(default)]
        check_vulnerabilities: bool,
    },
    Diagnose {
        #[serde(flatten)]
        options: DiagnoseInput,
    },
    CancelJob {
        job_id: String,
    },
    Sftp {
        read_only: bool,
        #[serde(default = "hour")]
        ttl_seconds: i64,
    },
}

fn local() -> String {
    "local".into()
}
fn hour() -> i64 {
    3600
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PowerSignal {
    Start,
    Stop,
    Restart,
}

impl ServerAction {
    pub fn permission(&self) -> &'static str {
        match self {
            Self::Power { .. } => "server.power",
            Self::Command { .. } => "console.write",
            Self::WriteFile { .. }
            | Self::Upload { .. }
            | Self::RenameFile { .. }
            | Self::RemoveFile { .. }
            | Self::Mkdir { .. } => "files.write",
            Self::TogglePackage { .. }
            | Self::InstallPackage { .. }
            | Self::InstallGithub { .. } => "packages.write",
            Self::Backup { .. } | Self::Restore { .. } => "backups.write",
            Self::Scan { .. } | Self::Diagnose { .. } | Self::CancelJob { .. } => {
                "diagnostics.write"
            }
            Self::Sftp {
                read_only: true, ..
            } => "files.read",
            Self::Sftp {
                read_only: false, ..
            } => "files.write",
        }
    }
    pub fn label(&self) -> &'static str {
        match self {
            Self::Power {
                signal: PowerSignal::Start,
            } => "Server started",
            Self::Power {
                signal: PowerSignal::Stop,
            } => "Server stopped",
            Self::Power {
                signal: PowerSignal::Restart,
            } => "Server restarted",
            Self::Command { .. } => "Console command",
            Self::WriteFile { .. } => "File saved",
            Self::Upload { .. } => "File uploaded",
            Self::RenameFile { .. } => "File renamed",
            Self::RemoveFile { .. } => "File removed",
            Self::Mkdir { .. } => "Directory created",
            Self::TogglePackage { .. } => "Package toggled",
            Self::InstallPackage { .. } | Self::InstallGithub { .. } => "Package installation",
            Self::Backup { .. } => "Backup requested",
            Self::Restore { .. } => "Restore requested",
            Self::Scan { .. } => "Security review",
            Self::Diagnose { .. } => "Isolated diagnosis",
            Self::CancelJob { .. } => "Job cancellation",
            Self::Sftp { .. } => "SFTP access issued",
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "query", rename_all = "snake_case")]
pub enum ServerQuery {
    Status,
    Logs { tail: u32 },
    Files { path: String },
    File { path: String },
    Packages,
    Backups,
    Jobs,
    Scan,
    Analysis,
}

impl ServerQuery {
    pub fn permission(&self) -> &'static str {
        match self {
            Self::Status => "server.read",
            Self::Logs { .. } => "console.read",
            Self::Files { .. } | Self::File { .. } => "files.read",
            Self::Packages => "packages.read",
            Self::Backups => "backups.read",
            Self::Jobs | Self::Scan | Self::Analysis => "diagnostics.read",
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum Rpc {
    Info,
    Create {
        server: Server,
    },
    Update {
        server: Server,
    },
    Delete {
        server_id: String,
        confirmation: String,
    },
    Query {
        server_id: String,
        #[serde(flatten)]
        query: ServerQuery,
    },
    Action {
        server_id: String,
        #[serde(flatten)]
        action: ServerAction,
    },
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SftpCredential {
    pub id: String,
    pub hash: String,
    pub server_id: String,
    pub read_only: bool,
    pub expires_at: i64,
}

impl Agent {
    pub fn new(mut config: Config) -> Result<Self> {
        std::fs::create_dir_all(&config.server_dir)?;
        std::fs::create_dir_all(&config.backup_dir)?;
        config.server_dir = config.server_dir.canonicalize()?;
        config.backup_dir = config.backup_dir.canonicalize()?;
        let store = Store::open(&config.data_dir)?;
        let jobs = Jobs::new(store.clone())?;
        Ok(Self {
            docker: Docker::new(&config)?,
            catalog: Catalog::new(&config)?,
            config: Arc::new(config),
            store,
            jobs,
            capacity: Default::default(),
        })
    }

    pub fn server_path(&self, server: &Server) -> PathBuf {
        self.config.server_dir.join(&server.id)
    }
    pub fn files(&self, server: &Server) -> Result<Files> {
        Files::open(
            &self.server_path(server),
            self.config.container_uid,
            self.config.container_gid,
        )
    }
    pub fn server(&self, id: &str) -> Result<Server> {
        valid_id(id)?;
        self.store.need("server", id)
    }

    pub async fn require_stopped(&self, server: &Server) -> Result<()> {
        if self
            .docker
            .inspect(server)
            .await?
            .is_some_and(|v| v["State"]["Running"] == true)
        {
            Err(Error::Conflict(
                "Stop the server before this operation".into(),
            ))
        } else {
            Ok(())
        }
    }

    pub async fn info(&self) -> Result<Value> {
        let docker = self.docker.info().await?;
        Ok(
            json!({"name":self.config.node_name,"version":env!("CARGO_PKG_VERSION"),"os":docker["OperatingSystem"],"architecture":docker["Architecture"],"cpu_cores":docker["NCPU"],"memory_bytes":docker["MemTotal"],"docker_version":docker["ServerVersion"],"sftp_listen":self.config.sftp_listen,"backup_destinations":std::iter::once("local".to_owned()).chain(self.config.backup_remotes.keys().cloned()).collect::<Vec<_>>(),"disk_enforcement":"monitored budget; CPU/RAM are hard cgroup limits"}),
        )
    }

    pub async fn create(&self, server: Server) -> Result<Value> {
        let _lock = self.jobs.lock("node-creation")?;
        valid_id(&server.id)?;
        server.config.validate()?;
        require(
            self.store.get::<Server>("server", &server.id)?.is_none(),
            "Server already exists",
        )?;
        for other in self.store.list::<Server>("server")? {
            require(
                other.config.port != server.config.port,
                "Game port is already allocated to another server",
            )?;
        }
        std::fs::create_dir(self.server_path(&server))?;
        let files = self.files(&server)?;
        files.own_dir(&files.dir)?;
        files.write("eula.txt", b"eula=true\n", None)?;
        let password = auth::new_secret();
        self.store.put("rcon", &server.id, &password)?;
        self.store.put("server", &server.id, &server)?;
        self.store.put(
            "snapshot",
            &server.id,
            &Snapshot::offline(&server.config.motd),
        )?;
        Ok(json!({"id":server.id,"state":"offline"}))
    }

    pub async fn update(&self, server: Server) -> Result<Value> {
        let _lock = self.jobs.lock(&server.id)?;
        server.config.validate()?;
        let previous = self.server(&server.id)?;
        self.require_stopped(&previous).await?;
        for other in self.store.list::<Server>("server")? {
            require(
                other.id == server.id || other.config.port != server.config.port,
                "Game port is already allocated",
            )?;
        }
        self.docker.remove(&previous).await?;
        let files = self.files(&server)?;
        if files.dir.try_exists("server.properties")? {
            let bytes = files.read("server.properties", 1024 * 1024)?;
            let text = String::from_utf8(bytes)
                .map_err(|_| Error::bad("server.properties is not UTF-8"))?;
            let mut lines = text
                .lines()
                .filter(|line| !line.starts_with("motd=") && !line.starts_with("max-players="))
                .map(String::from)
                .collect::<Vec<_>>();
            lines.push(format!("motd={}", server.config.motd.replace('\\', "\\\\")));
            lines.push(format!("max-players={}", server.config.max_players));
            files.write(
                "server.properties",
                format!("{}\n", lines.join("\n")).as_bytes(),
                None,
            )?;
        }
        self.store.put("server", &server.id, &server)?;
        Ok(json!({"updated":true,"restart_required":true}))
    }

    pub async fn query(&self, server: &Server, query: ServerQuery) -> Result<Value> {
        match query {
            ServerQuery::Status => {
                let snapshot = self
                    .store
                    .get::<Snapshot>("snapshot", &server.id)?
                    .unwrap_or_else(|| Snapshot::offline(&server.config.motd));
                Ok(json!({"snapshot":snapshot,"history":self.store.history(&server.id)?}))
            }
            ServerQuery::Logs { tail } => {
                Ok(json!({"text":security::redact(&self.docker.logs(server,tail).await?)}))
            }
            ServerQuery::Files { path } => Ok(json!({"entries":self.files(server)?.list(&path)?})),
            ServerQuery::File { path } => {
                let bytes = self.files(server)?.read(&path, WEB_FILE_LIMIT)?;
                let hash = hex::encode(Sha256::digest(&bytes));
                let text = std::str::from_utf8(&bytes).ok();
                Ok(
                    json!({"path":path,"content":text.map(String::from).unwrap_or_else(||STANDARD.encode(&bytes)),"encoding":if text.is_some(){"utf8"}else{"base64"},"sha256":hash,"size":bytes.len()}),
                )
            }
            ServerQuery::Packages => catalog::installed(&self.files(server)?, &self.store, server),
            ServerQuery::Backups => Ok(
                json!({"backups":self.store.list::<Backup>("backup")?.into_iter().filter(|b|b.server_id==server.id).collect::<Vec<_>>(),"destinations":std::iter::once("local".to_owned()).chain(self.config.backup_remotes.keys().cloned()).collect::<Vec<_>>()}),
            ),
            ServerQuery::Jobs => Ok(
                json!({"jobs":self.store.list::<Job>("job")?.into_iter().filter(|j|j.server_id==server.id).take(50).collect::<Vec<_>>()}),
            ),
            ServerQuery::Scan => Ok(self
                .store
                .get::<Value>("scan", &server.id)?
                .unwrap_or(json!({"jars":[],"at":null}))),
            ServerQuery::Analysis => Ok(security::analyze_logs(
                &self.docker.logs(server, 1000).await?,
            )),
        }
    }

    pub async fn action(&self, server: Server, action: ServerAction) -> Result<Value> {
        match action {
            ServerAction::Power { signal } => self.power(server, signal),
            ServerAction::Backup { destination } => {
                let agent = self.clone();
                let id = server.id.clone();
                Ok(json!(self.jobs.start(
                    &id,
                    "backup",
                    move |_| async move {
                        Ok(json!(backups::create(&agent, &server, &destination).await?))
                    }
                )?))
            }
            ServerAction::Restore { backup_id, confirm } => {
                let agent = self.clone();
                let id = server.id.clone();
                Ok(json!(
                    self.jobs.start(&id, "restore", move |_| async move {
                        backups::restore(&agent, &server, &backup_id, confirm).await
                    })?
                ))
            }
            ServerAction::InstallPackage { package } => {
                let agent = self.clone();
                let id = server.id.clone();
                Ok(json!(self.jobs.start(
                    &id,
                    "install",
                    move |job| async move {
                        agent.jobs.progress(
                            &job.id,
                            "Resolving compatible versions and required dependencies",
                        )?;
                        agent
                            .catalog
                            .install(&server, &agent.files(&server)?, &agent.store, &package)
                            .await
                    }
                )?))
            }
            ServerAction::InstallGithub {
                repository,
                asset_id,
                kind,
                confirm_compatibility,
            } => {
                require(
                    confirm_compatibility,
                    "Confirm compatibility before installing a GitHub release",
                )?;
                let agent = self.clone();
                let id = server.id.clone();
                Ok(json!(self.jobs.start(
                    &id,
                    "install",
                    move |_| async move {
                        agent
                            .catalog
                            .install_github(
                                &server,
                                &agent.files(&server)?,
                                &agent.store,
                                &repository,
                                asset_id,
                                &kind,
                            )
                            .await
                    }
                )?))
            }
            ServerAction::Scan {
                check_vulnerabilities,
            } => {
                let agent = self.clone();
                let id = server.id.clone();
                Ok(json!(self.jobs.start(
                    &id,
                    "scan",
                    move |_| async move {
                        security::scan(
                            &server,
                            &agent.files(&server)?,
                            &agent.store,
                            &agent.catalog,
                            check_vulnerabilities,
                        )
                        .await
                    }
                )?))
            }
            ServerAction::Diagnose { options } => {
                let agent = self.clone();
                let id = server.id.clone();
                Ok(json!(self.jobs.start(
                    &id,
                    "diagnose",
                    move |job| async move { diagnostics::run(agent, server, job, options).await }
                )?))
            }
            ServerAction::CancelJob { job_id } => {
                let job: Job = self.store.need("job", &job_id)?;
                require(
                    job.server_id == server.id && job.kind == "diagnose",
                    "Only this server's diagnostic jobs can be cancelled",
                )?;
                self.store
                    .update::<Job>("job", &job_id, |job| job.cancel_requested = true)?;
                Ok(json!({"cancel_requested":true}))
            }
            ServerAction::Sftp {
                read_only,
                ttl_seconds,
            } => {
                require(
                    (60..=86_400).contains(&ttl_seconds),
                    "SFTP credentials may live for 1 minute to 24 hours",
                )?;
                let password = auth::new_secret();
                let hash = auth::digest(&password);
                let credential = SftpCredential {
                    id: uuid::Uuid::new_v4().to_string(),
                    hash: hash.clone(),
                    server_id: server.id.clone(),
                    read_only,
                    expires_at: now() + ttl_seconds,
                };
                self.store.put("sftp", &hash, &credential)?;
                Ok(
                    json!({"username":server.id,"password":password,"expires_at":credential.expires_at,"read_only":read_only}),
                )
            }
            operation => {
                let _lock = self.jobs.lock(&server.id)?;
                self.quick_action(&server, operation).await
            }
        }
    }

    fn power(&self, server: Server, signal: PowerSignal) -> Result<Value> {
        let agent = self.clone();
        let id = server.id.clone();
        let job=self.jobs.start(&id,"power",move|job|async move{
            if matches!(signal,PowerSignal::Stop|PowerSignal::Restart) {agent.jobs.progress(&job.id,"Gracefully stopping Minecraft")?;agent.docker.stop(&server).await?;}
            if matches!(signal,PowerSignal::Start|PowerSignal::Restart) {
                let _capacity=agent.capacity.lock().await;
                agent.ensure_capacity(&server).await?;
                agent.jobs.progress(&job.id,"Preparing Java image and starting the container; first boot downloads the core")?;
                let password:String=agent.store.need("rcon",&server.id)?;
                agent.docker.start(&server,&agent.server_path(&server),&password,&agent.config,true).await?;
            }
            agent.refresh(&server).await?;
            Ok(json!({"accepted":true}))
        })?;
        Ok(json!(job))
    }

    async fn ensure_capacity(&self, server: &Server) -> Result<()> {
        let info = self.docker.info().await?;
        let total = info["MemTotal"].as_u64().unwrap_or(0);
        let mut reserved = u64::from(server.config.memory_mb) * 1024 * 1024 + 384 * 1024 * 1024;
        for other in self.store.list::<Server>("server")? {
            if other.id != server.id
                && self
                    .docker
                    .inspect(&other)
                    .await?
                    .is_some_and(|v| v["State"]["Running"] == true)
            {
                reserved += u64::from(other.config.memory_mb) * 1024 * 1024;
            }
        }
        require(
            reserved <= total,
            "Not enough unreserved node memory. Stop another server or lower its memory limit.",
        )?;
        require(
            self.files(server)?.size()? <= server.config.disk_mb * 1024 * 1024,
            "Server has exceeded its disk budget",
        )
    }

    async fn quick_action(&self, server: &Server, action: ServerAction) -> Result<Value> {
        let files = self.files(server)?;
        match action {
            ServerAction::Command { command } => {
                return Ok(
                    json!({"output":security::redact(&self.docker.command(server,&command).await?)}),
                );
            }
            ServerAction::WriteFile {
                path,
                content,
                expected_hash,
            } => {
                self.write_budget(server, &files, content.len())?;
                files.write(&path, content.as_bytes(), expected_hash.as_deref())?;
            }
            ServerAction::Upload { path, data } => {
                let bytes = STANDARD
                    .decode(data)
                    .map_err(|_| Error::bad("Upload must contain base64 data"))?;
                self.write_budget(server, &files, bytes.len())?;
                files.write(&path, &bytes, None)?;
            }
            ServerAction::RenameFile { from, to } => files.rename(&from, &to)?,
            ServerAction::RemoveFile { path } => files.remove(&path)?,
            ServerAction::Mkdir { path } => files.mkdir(&path)?,
            ServerAction::TogglePackage { path, enabled } => {
                require(
                    (path.starts_with("plugins/") || path.starts_with("mods/"))
                        && (path.ends_with(".jar") || path.ends_with(".jar.disabled")),
                    "Expected a plugin or mod JAR path",
                )?;
                let currently_enabled = path.ends_with(".jar");
                if currently_enabled != enabled {
                    let target = if enabled {
                        path.trim_end_matches(".disabled").to_owned()
                    } else {
                        format!("{path}.disabled")
                    };
                    files.rename(&path, &target)?;
                }
                return Ok(json!({"enabled":enabled,"restart_required":true}));
            }
            _ => return Err(Error::bad("Unsupported synchronous operation")),
        }
        Ok(json!({"ok":true}))
    }

    fn write_budget(&self, server: &Server, files: &Files, added: usize) -> Result<()> {
        require(
            files.size()?.saturating_add(added as u64) <= server.config.disk_mb * 1024 * 1024,
            "Server disk budget would be exceeded",
        )
    }

    pub async fn refresh(&self, server: &Server) -> Result<()> {
        let mut snapshot = self.docker.snapshot(server).await?;
        let files = self.files(server)?;
        snapshot.disk_bytes = tokio::task::spawn_blocking(move || files.size())
            .await
            .map_err(anyhow::Error::from)??;
        if self.files(server)?.dir.try_exists("server.properties")? {
            let bytes = self.files(server)?.read("server.properties", 1024 * 1024)?;
            if let Some(motd) = String::from_utf8_lossy(&bytes)
                .lines()
                .find_map(|line| line.strip_prefix("motd="))
            {
                snapshot.motd = motd.into();
            }
        }
        self.store.put("snapshot", &server.id, &snapshot)?;
        self.store.metric(&server.id,&json!({"at":snapshot.at,"cpu":snapshot.cpu_percent,"memory":snapshot.memory_bytes,"players":snapshot.players.as_ref().map(|p|p.online)}))?;
        Ok(())
    }
}

pub fn router(agent: Agent) -> Router {
    Router::new()
        .route("/v1/rpc", post(dispatch))
        .route("/v1/backups/{server_id}/{id}", get(download_backup))
        .route_layer(middleware::from_fn_with_state(agent.clone(), authorize))
        .route(
            "/healthz",
            get(|| async { Json(json!({"ok":true,"service":"emberdeck-agent"})) }),
        )
        .layer(DefaultBodyLimit::max(48 * 1024 * 1024))
        .with_state(agent)
}

async fn authorize(State(agent): State<Agent>, request: Request, next: Next) -> Result<Response> {
    if !auth::bearer(request.headers())
        .is_some_and(|secret| auth::matches(secret, &agent.config.master_token_hash))
    {
        return Err(Error::Unauthorized);
    }
    Ok(next.run(request).await)
}

async fn download_backup(
    State(agent): State<Agent>,
    UrlPath((server_id, id)): UrlPath<(String, String)>,
) -> Result<Response> {
    valid_id(&id)?;
    agent.server(&server_id)?;
    let backup: Backup = agent.store.need("backup", &id)?;
    require(
        backup.server_id == server_id,
        "Backup belongs to another server",
    )?;
    let file = tokio::fs::File::open(
        agent
            .config
            .backup_dir
            .join(&server_id)
            .join(format!("{id}.tar.gz")),
    )
    .await?;
    let length = file.metadata().await?.len();
    Ok((
        [
            (header::CONTENT_TYPE, "application/gzip".to_owned()),
            (header::CONTENT_LENGTH, length.to_string()),
        ],
        Body::from_stream(tokio_util::io::ReaderStream::new(file)),
    )
        .into_response())
}

async fn dispatch(State(agent): State<Agent>, Json(rpc): Json<Rpc>) -> Result<Json<Value>> {
    let result = match rpc {
        Rpc::Info => agent.info().await?,
        Rpc::Create { server } => agent.create(server).await?,
        Rpc::Update { server } => agent.update(server).await?,
        Rpc::Query { server_id, query } => agent.query(&agent.server(&server_id)?, query).await?,
        Rpc::Action { server_id, action } => {
            agent.action(agent.server(&server_id)?, action).await?
        }
        Rpc::Delete {
            server_id,
            confirmation,
        } => {
            let _lock = agent.jobs.lock(&server_id)?;
            let server = agent.server(&server_id)?;
            require(
                confirmation == server.config.name,
                "Type the server name to confirm deletion",
            )?;
            agent.require_stopped(&server).await?;
            agent.docker.remove(&server).await?;
            let archived = agent
                .config
                .server_dir
                .join(format!("deleted-{}", server.id));
            std::fs::rename(agent.server_path(&server), &archived)?;
            agent.store.delete("server", &server.id)?;
            json!({"deleted":true,"files_archived":archived})
        }
    };
    Ok(Json(result))
}

pub async fn monitor(agent: Agent) {
    loop {
        match agent.store.list::<Server>("server") {
            Ok(servers) => {
                for server in servers {
                    if let Err(error) = agent.refresh(&server).await {
                        tracing::warn!(%error,server=%server.id,"Server observation failed");
                    }
                }
            }
            Err(error) => tracing::error!(%error,"Cannot load node servers"),
        }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}
