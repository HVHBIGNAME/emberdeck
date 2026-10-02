use crate::{
    auth::new_secret,
    error::{Result, require},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

pub const USER_AGENT: &str = "Emberdeck/0.1.0 (https://github.com/HVHBIGNAME/emberdeck)";

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub listen: String,
    pub public_url: String,
    pub data_dir: PathBuf,
    pub server_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub master_token_hash: String,
    pub agent_url: String,
    pub agent_token: String,
    pub node_name: String,
    pub public_host: String,
    pub sftp_listen: String,
    pub docker_socket: PathBuf,
    pub container_uid: u32,
    pub container_gid: u32,
    pub backup_remotes: BTreeMap<String, String>,
    pub rclone_config: Option<PathBuf>,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            listen: "127.0.0.1:8080".into(),
            public_url: "http://localhost:8080".into(),
            data_dir: ".emberdeck/panel".into(),
            server_dir: ".emberdeck/servers".into(),
            backup_dir: ".emberdeck/backups".into(),
            master_token_hash: String::new(),
            agent_url: "http://127.0.0.1:8081".into(),
            agent_token: String::new(),
            node_name: "Local node".into(),
            public_host: "localhost".into(),
            sftp_listen: "0.0.0.0:2022".into(),
            docker_socket: "/var/run/docker.sock".into(),
            container_uid: 1000,
            container_gid: 1000,
            backup_remotes: BTreeMap::new(),
            rclone_config: None,
            ai_base_url: "https://api.openai.com/v1".into(),
            ai_model: "gpt-4.1-mini".into(),
            ai_api_key: String::new(),
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let mut config: Self =
            toml::from_str(&fs::read_to_string(path)?).map_err(anyhow::Error::from)?;
        if let Ok(key) = std::env::var("EMBER_AI_API_KEY") {
            config.ai_api_key = key;
        }
        require(
            config.master_token_hash.len() == 64,
            "Configure master_token_hash with emberdeck setup first",
        )?;
        Ok(config)
    }

    pub fn http_client(&self) -> Result<reqwest::Client> {
        Ok(reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::none())
            .build()?)
    }
}

pub fn private_write(path: &Path, content: impl AsRef<[u8]>) -> Result<()> {
    use std::io::Write;
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(content.as_ref())?;
    file.sync_all()?;
    Ok(())
}

#[derive(clap::Args)]
pub struct SetupNetwork {
    #[arg(long, default_value = "127.0.0.1:8080")]
    pub panel_listen: std::net::SocketAddr,
    #[arg(long, default_value = "127.0.0.1:8081")]
    pub agent_listen: std::net::SocketAddr,
    #[arg(long, default_value = "0.0.0.0:2022")]
    pub sftp_listen: std::net::SocketAddr,
    #[arg(long, default_value = "http://localhost:8080")]
    pub public_url: String,
    #[arg(long, default_value = "localhost")]
    pub public_host: String,
}

pub fn setup(directory: &Path, data: &Path, network: &SetupNetwork) -> Result<()> {
    require(
        network.panel_listen.port() != network.agent_listen.port()
            && network.panel_listen.port() != network.sftp_listen.port()
            && network.agent_listen.port() != network.sftp_listen.port(),
        "Panel, agent and SFTP ports must be different",
    )?;
    fs::create_dir_all(directory)?;
    require(
        !directory.join("panel.toml").exists() && !directory.join("agent.toml").exists(),
        "Configuration already exists; setup never overwrites credentials",
    )?;
    let owner = new_secret();
    let agent = new_secret();
    let mut agent_address = network.agent_listen;
    if agent_address.ip().is_unspecified() {
        agent_address.set_ip(if agent_address.is_ipv4() {
            std::net::Ipv4Addr::LOCALHOST.into()
        } else {
            std::net::Ipv6Addr::LOCALHOST.into()
        });
    }
    let base = Config {
        listen: network.panel_listen.to_string(),
        public_url: network.public_url.clone(),
        public_host: network.public_host.clone(),
        agent_url: format!("http://{agent_address}"),
        sftp_listen: network.sftp_listen.to_string(),
        server_dir: data.join("servers"),
        backup_dir: data.join("backups"),
        ..Config::default()
    };
    let panel = Config {
        data_dir: data.join("panel"),
        master_token_hash: crate::auth::digest(&owner),
        agent_token: agent.clone(),
        ..base.clone()
    };
    let agent_config = Config {
        listen: network.agent_listen.to_string(),
        data_dir: data.join("agent"),
        master_token_hash: crate::auth::digest(&agent),
        ..base
    };
    private_write(
        &directory.join("panel.toml"),
        toml::to_string_pretty(&panel).map_err(anyhow::Error::from)?,
    )?;
    private_write(
        &directory.join("agent.toml"),
        toml::to_string_pretty(&agent_config).map_err(anyhow::Error::from)?,
    )?;
    private_write(&directory.join("owner-token"), format!("{owner}\n"))?;
    println!(
        "Configuration: {}\nOwner token: {}\nKeep this token private. It is shown only in that file.",
        directory.display(),
        directory.join("owner-token").display()
    );
    Ok(())
}
