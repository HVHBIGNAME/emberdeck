use crate::{
    config::Config,
    error::{Error, Result, require},
};
use clap::{Args, Subcommand, ValueEnum};
use serde_json::{Value, json};
use std::path::PathBuf;

#[derive(Args)]
pub struct Options {
    #[arg(
        long,
        env = "EMBER_URL",
        default_value = "http://127.0.0.1:8080",
        global = true
    )]
    pub url: String,
    #[arg(long, env = "EMBER_TOKEN", hide_env_values = true, global = true)]
    pub token: Option<String>,
    #[arg(long, global = true)]
    pub token_file: Option<PathBuf>,
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// List servers visible to your access token.
    Servers,
    /// Start, stop, or restart a server.
    Power {
        server: String,
        #[arg(value_enum)]
        signal: Signal,
    },
    /// Send a Minecraft console command, without invoking a shell.
    #[command(name = "command")]
    Console { server: String, command: String },
    /// Read recent container logs.
    Logs {
        server: String,
        #[arg(long, default_value_t = 200)]
        tail: u32,
    },
    /// Create a server from a JSON specification.
    Create {
        #[arg(long)]
        file: PathBuf,
    },
    /// Read files in a server directory.
    Files {
        server: String,
        #[arg(default_value = "/")]
        path: String,
    },
    /// Create a local or configured remote backup.
    Backup {
        server: String,
        #[arg(long, default_value = "local")]
        destination: String,
    },
    /// Install a compatible Modrinth package and its required dependencies.
    Install {
        server: String,
        project: String,
        version: String,
        #[arg(long, default_value = "plugin")]
        kind: String,
    },
    /// Inspect the status of background operations.
    Jobs { server: String },
    /// Access any authenticated API endpoint (JSON in, JSON out).
    Api {
        method: String,
        path: String,
        #[arg(long)]
        body: Option<String>,
        #[arg(long)]
        file: Option<PathBuf>,
    },
}

#[derive(Clone, ValueEnum)]
pub enum Signal {
    Start,
    Stop,
    Restart,
}

pub async fn run(options: Options) -> Result<()> {
    let token = match (options.token, options.token_file) {
        (Some(token), _) => token,
        (None, Some(file)) => std::fs::read_to_string(file)?.trim().into(),
        _ => {
            return Err(Error::bad(
                "Set EMBER_TOKEN or use --token-file to authenticate",
            ));
        }
    };
    let list = matches!(options.command, Command::Servers);
    let logs = matches!(options.command, Command::Logs { .. });
    let (method, path, body) = request(options.command)?;
    let base = reqwest::Url::parse(&options.url).map_err(|_| Error::bad("Invalid panel URL"))?;
    require(
        matches!(base.scheme(), "http" | "https")
            && base.username().is_empty()
            && base.password().is_none(),
        "Use an HTTP(S) panel origin without embedded credentials",
    )?;
    require(
        path.starts_with("/api/") && !path.contains(['\r', '\n']),
        "API path must start with /api/",
    )?;
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| Error::bad("Invalid HTTP method"))?;
    let client = Config::default().http_client()?;
    let mut request = client
        .request(
            method,
            format!("{}{path}", options.url.trim_end_matches('/')),
        )
        .bearer_auth(token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await?;
    let status = response.status();
    let value: Value = response.json().await?;
    if !status.is_success() {
        return Err(Error::Upstream(format!(
            "{status}: {}",
            value["error"].as_str().unwrap_or("request failed")
        )));
    }
    if list && !options.json {
        println!("{:<36}  {:<24}  {:<12}  ADDRESS", "ID", "SERVER", "STATE");
        for server in value["servers"].as_array().into_iter().flatten() {
            println!(
                "{:<36}  {:<24}  {:<12}  {}",
                server["id"].as_str().unwrap_or(""),
                server["name"].as_str().unwrap_or(""),
                server["snapshot"]["state"].as_str().unwrap_or("unknown"),
                server["address"].as_str().unwrap_or("")
            );
        }
    } else if logs && !options.json {
        print!("{}", value["text"].as_str().unwrap_or(""));
    } else {
        println!("{}", serde_json::to_string_pretty(&value)?);
    }
    Ok(())
}

fn request(command: Command) -> Result<(String, String, Option<Value>)> {
    let (method, path, body) = match command {
        Command::Servers => ("GET".into(), "/api/servers".into(), None),
        Command::Power { server, signal } => action(
            &server,
            json!({"action":"power","signal":match signal{Signal::Start=>"start",Signal::Stop=>"stop",Signal::Restart=>"restart"}}),
        )?,
        Command::Console { server, command } => {
            action(&server, json!({"action":"command","command":command}))?
        }
        Command::Logs { server, tail } => {
            crate::models::valid_id(&server)?;
            (
                "GET".into(),
                format!("/api/servers/{server}/logs?tail={tail}"),
                None,
            )
        }
        Command::Create { file } => (
            "POST".into(),
            "/api/servers".into(),
            Some(serde_json::from_slice(&std::fs::read(file)?)?),
        ),
        Command::Files { server, path } => {
            crate::models::valid_id(&server)?;
            let url = reqwest::Url::parse_with_params(
                &format!("http://localhost/api/servers/{server}/files"),
                &[("path", path)],
            )
            .map_err(anyhow::Error::from)?;
            (
                "GET".into(),
                format!("{}?{}", url.path(), url.query().unwrap_or("")),
                None,
            )
        }
        Command::Backup {
            server,
            destination,
        } => action(
            &server,
            json!({"action":"backup","destination":destination}),
        )?,
        Command::Install {
            server,
            project,
            version,
            kind,
        } => action(
            &server,
            json!({"action":"install_package","project_id":project,"version_id":version,"kind":kind}),
        )?,
        Command::Jobs { server } => {
            crate::models::valid_id(&server)?;
            ("GET".into(), format!("/api/servers/{server}/jobs"), None)
        }
        Command::Api {
            method,
            path,
            body,
            file,
        } => {
            require(
                body.is_none() || file.is_none(),
                "Use --body or --file, not both",
            )?;
            let body = match (body, file) {
                (Some(body), _) => Some(serde_json::from_str(&body)?),
                (_, Some(file)) => Some(serde_json::from_slice(&std::fs::read(file)?)?),
                _ => None,
            };
            (method.to_uppercase(), path, body)
        }
    };
    Ok((method, path, body))
}
fn action(server: &str, body: Value) -> Result<(String, String, Option<Value>)> {
    crate::models::valid_id(server)?;
    Ok((
        "POST".into(),
        format!("/api/servers/{server}/actions"),
        Some(body),
    ))
}
