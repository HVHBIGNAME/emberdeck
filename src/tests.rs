use crate::{
    agent::{PowerSignal, Rpc, ServerAction},
    auth::{self, Role, TokenInput},
    config::Config,
    models::{Server, ServerInput},
    panel::{self, Panel},
};
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

fn setup() -> (tempfile::TempDir, Panel, String) {
    static TLS: std::sync::Once = std::sync::Once::new();
    TLS.call_once(|| {
        rustls::crypto::ring::default_provider()
            .install_default()
            .expect("test TLS provider");
    });
    let temporary = tempfile::tempdir().unwrap();
    let token = auth::new_secret();
    let config = Config {
        data_dir: temporary.path().join("panel"),
        master_token_hash: auth::digest(&token),
        ..Default::default()
    };
    (temporary, Panel::new(config).unwrap(), token)
}

fn server(id: &str) -> Server {
    Server {
        id: id.into(),
        created_at: crate::store::now(),
        config: ServerInput {
            name: format!("World {id}"),
            node_id: "local".into(),
            template: "paper".into(),
            version: "1.21.1".into(),
            loader_version: String::new(),
            memory_mb: 2048,
            cpu_limit: 1.5,
            disk_mb: 8192,
            port: 25565,
            max_players: 20,
            motd: "Hello".into(),
            java: None,
            modpack: None,
            environment: Default::default(),
            accept_eula: true,
        },
    }
}

async fn body(response: axum::response::Response) -> Value {
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}
fn request(method: &str, path: &str, token: Option<&str>, body: Value) -> Request<Body> {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "localhost")
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let mut request = request.body(Body::from(body.to_string())).unwrap();
    request.extensions_mut().insert(ConnectInfo(
        "127.0.0.1:12345".parse::<std::net::SocketAddr>().unwrap(),
    ));
    request
}

#[tokio::test]
async fn unauthenticated_requests_do_not_expose_servers() {
    let (_temp, panel, _token) = setup();
    panel.store.put("server", "one", &server("one")).unwrap();
    let response = panel::router(panel)
        .oneshot(request("GET", "/api/servers", None, Value::Null))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(!body(response).await.to_string().contains("World one"));
}

#[tokio::test]
async fn scoped_viewer_sees_only_assigned_server_and_cannot_control_it() {
    let (_temp, panel, _owner) = setup();
    for id in ["one", "two"] {
        panel.store.put("server", id, &server(id)).unwrap();
    }
    let (token, _) = auth::issue(
        &panel.store,
        TokenInput {
            name: "Viewer".into(),
            role: Role::Viewer,
            server_ids: vec!["one".into()],
            permissions: None,
            expires_at: None,
        },
    )
    .unwrap();
    let router = panel::router(panel);
    let response = router
        .clone()
        .oneshot(request("GET", "/api/servers", Some(&token), Value::Null))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let result = body(response).await;
    assert_eq!(result["servers"].as_array().unwrap().len(), 1);
    assert_eq!(result["servers"][0]["id"], "one");
    for (method, path, value) in [
        ("GET", "/api/servers/two", Value::Null),
        (
            "POST",
            "/api/servers/one/actions",
            json!({"action":"power","signal":"start"}),
        ),
    ] {
        let response = router
            .clone()
            .oneshot(request(method, path, Some(&token), value))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}

#[tokio::test]
async fn revocation_invalidates_existing_cookie_sessions() {
    let (_temp, panel, owner) = setup();
    let (token, record) = auth::issue(
        &panel.store,
        TokenInput {
            name: "Guest".into(),
            role: Role::Viewer,
            server_ids: vec!["*".into()],
            permissions: None,
            expires_at: None,
        },
    )
    .unwrap();
    let router = panel::router(panel);
    let response = router
        .clone()
        .oneshot(request(
            "POST",
            "/api/auth/login",
            None,
            json!({"token":token}),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let set_cookie = response.headers()["set-cookie"].to_str().unwrap();
    assert!(set_cookie.contains("HttpOnly") && set_cookie.contains("SameSite=Strict"));
    let cookie = set_cookie.split(';').next().unwrap().to_owned();
    let response = router
        .clone()
        .oneshot(request(
            "DELETE",
            &format!("/api/tokens/{}", record.id),
            Some(&owner),
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut req = request("GET", "/api/auth/me", None, Value::Null);
    req.headers_mut().insert("cookie", cookie.parse().unwrap());
    assert_eq!(
        router.oneshot(req).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn cookie_mutations_require_same_origin() {
    let (_temp, panel, owner) = setup();
    let router = panel::router(panel);
    let response = router
        .clone()
        .oneshot(request(
            "POST",
            "/api/auth/login",
            None,
            json!({"token":owner}),
        ))
        .await
        .unwrap();
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let mut req = request(
        "POST",
        "/api/tokens",
        None,
        json!({"name":"Injected","role":"viewer","server_ids":["*"]}),
    );
    req.headers_mut().insert("cookie", cookie.parse().unwrap());
    req.headers_mut()
        .insert("origin", "https://unrelated.example".parse().unwrap());
    assert_eq!(
        router.oneshot(req).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}

#[test]
fn typed_node_protocol_roundtrips_every_payload_shape() {
    let requests = [
        Rpc::Create {
            server: server("one"),
        },
        Rpc::Action {
            server_id: "one".into(),
            action: ServerAction::Power {
                signal: PowerSignal::Start,
            },
        },
        Rpc::Action {
            server_id: "one".into(),
            action: ServerAction::InstallPackage {
                package: crate::catalog::PackageInstall {
                    project_id: "luckperms".into(),
                    version_id: "release".into(),
                    kind: "plugin".into(),
                },
            },
        },
        Rpc::Action {
            server_id: "one".into(),
            action: ServerAction::Diagnose {
                options: crate::diagnostics::DiagnoseInput {
                    error_text: "Boom".into(),
                    timeout_secs: 60,
                    max_trials: 10,
                    apply_fix: false,
                },
            },
        },
    ];
    for request in requests {
        let encoded = serde_json::to_value(request).unwrap();
        let decoded = serde_json::from_value::<Rpc>(encoded.clone());
        assert!(
            decoded.is_ok(),
            "{encoded}: {}",
            decoded.err().map(|e| e.to_string()).unwrap_or_default()
        );
    }
}

#[test]
fn container_limits_and_control_port_are_isolated() {
    let spec = server("one");
    let config = Config::default();
    let value = crate::runtime::container_config(
        &spec,
        std::path::Path::new("/var/lib/emberdeck/servers/one"),
        "test-only",
        &config,
        "emberdeck-one",
        true,
    )
    .unwrap();
    assert_eq!(value["HostConfig"]["Memory"], 2048_u64 * 1024 * 1024);
    assert_eq!(
        value["HostConfig"]["MemorySwap"],
        value["HostConfig"]["Memory"]
    );
    assert_eq!(value["HostConfig"]["NanoCpus"], 1_500_000_000_u64);
    assert_eq!(value["HostConfig"]["CapDrop"], json!(["ALL"]));
    assert!(
        value["HostConfig"]["PortBindings"]
            .get("25575/tcp")
            .is_none()
    );
    assert_eq!(value["User"], "1000:1000");
}

#[test]
fn validates_eula_and_environment_allowlist() {
    let mut input = server("one").config;
    input.accept_eula = false;
    assert!(input.validate().is_err());
    input.accept_eula = true;
    input
        .environment
        .insert("JVM_OPTS".into(), "-javaagent:/evil.jar".into());
    assert!(input.validate().is_err());
    input.environment.clear();
    input.cpu_limit = f64::NAN;
    assert!(input.validate().is_err());
}

#[tokio::test]
async fn agent_authentication_precedes_body_parsing() {
    let (temporary, panel, _) = setup();
    let config = Config {
        data_dir: temporary.path().join("agent"),
        server_dir: temporary.path().join("servers"),
        backup_dir: temporary.path().join("backups"),
        ..(*panel.config).clone()
    };
    let router = crate::agent::router(crate::agent::Agent::new(config).unwrap());
    let request = Request::builder()
        .method("POST")
        .uri("/v1/rpc")
        .header("content-type", "application/json")
        .body(Body::from("not valid JSON"))
        .unwrap();
    assert_eq!(
        router.oneshot(request).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
}
