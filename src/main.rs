mod access;
mod agent;
mod assistant;
mod auth;
mod backups;
mod catalog;
mod cli;
mod config;
mod diagnostics;
mod error;
mod files;
mod jobs;
mod models;
mod panel;
mod runtime;
mod scheduler;
mod security;
mod sftp;
mod store;
mod templates;
#[cfg(test)]
mod tests;
mod tunnel;
mod web;

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "emberdeck",
    version,
    about = "One binary. Every world. Native Minecraft server management."
)]
struct Arguments {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the control plane and embedded web interface.
    Panel {
        #[arg(long, default_value = "/etc/emberdeck/panel.toml")]
        config: PathBuf,
        #[arg(long)]
        listen: Option<String>,
    },
    /// Run a Linux Docker node and scoped SFTP service.
    Agent {
        #[arg(long, default_value = "/etc/emberdeck/agent.toml")]
        config: PathBuf,
        #[arg(long)]
        listen: Option<String>,
    },
    /// Explore a read-only demonstration without Docker or credentials.
    Demo {
        #[arg(long, default_value = "127.0.0.1:8080")]
        listen: String,
    },
    /// Generate fresh panel/node configuration and an owner token.
    Setup {
        #[arg(long, default_value = "/etc/emberdeck")]
        config_dir: PathBuf,
        #[arg(long, default_value = "/var/lib/emberdeck")]
        data_dir: PathBuf,
        #[command(flatten)]
        network: config::SetupNetwork,
    },
    /// Generate a management token and its SHA-256 configuration hash.
    Keygen,
    /// Manage a remote panel from the command line.
    Cli(cli::Options),
    /// Configure private access, Cloudflare Tunnel or a managed HTTPS proxy.
    Access {
        #[command(subcommand)]
        command: access::Command,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| anyhow::anyhow!("TLS provider already initialized"))?;
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "emberdeck=info,tower_http=warn".into()),
        )
        .with_writer(std::io::stderr)
        .init();
    match Arguments::parse().command {
        Command::Setup {
            config_dir,
            data_dir,
            network,
        } => config::setup(&config_dir, &data_dir, &network)?,
        Command::Keygen => {
            let token = auth::new_secret();
            println!(
                "token = {token}\nmaster_token_hash = {}",
                auth::digest(&token)
            );
        }
        Command::Cli(options) => cli::run(options).await?,
        Command::Access { command } => access::run(command).await?,
        Command::Panel { config, listen } => {
            let mut config = config::Config::load(&config)?;
            if let Some(listen) = listen {
                config.listen = listen;
            }
            let listen = config.listen.clone();
            let state = panel::Panel::new(config)?;
            tokio::spawn(panel::observe(state.clone()));
            panel::serve(&listen, panel::router(state)).await?;
        }
        Command::Agent { config, listen } => {
            anyhow::ensure!(
                cfg!(target_os = "linux"),
                "The node agent currently supports Linux. Use panel, demo or cli on this operating system."
            );
            let mut config = config::Config::load(&config)?;
            if let Some(listen) = listen {
                config.listen = listen;
            }
            let listen = config.listen.clone();
            let state = agent::Agent::new(config)?;
            tokio::spawn(agent::monitor(state.clone()));
            tokio::select! {result=panel::serve(&listen,agent::router(state.clone()))=>result?,result=sftp::serve(state)=>result?};
        }
        Command::Demo { listen } => {
            let router = axum::Router::new()
                .route(
                    "/",
                    axum::routing::get(|| async { axum::response::Redirect::temporary("/demo") }),
                )
                .fallback(web::asset)
                .layer(axum::middleware::from_fn(web::headers));
            panel::serve(&listen, router).await?;
        }
    }
    Ok(())
}
