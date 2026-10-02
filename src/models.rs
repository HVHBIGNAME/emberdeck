use crate::error::{Result, require};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub name: String,
    pub url: String,
    pub token: String,
    pub public_host: String,
    pub sftp_port: u16,
}

impl Node {
    pub fn public(&self) -> serde_json::Value {
        serde_json::json!({"id":self.id,"name":self.name,"url":self.url,"public_host":self.public_host,"sftp_port":self.sftp_port})
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServerInput {
    pub name: String,
    #[serde(default = "local_node")]
    pub node_id: String,
    pub template: String,
    pub version: String,
    #[serde(default)]
    pub loader_version: String,
    pub memory_mb: u32,
    pub cpu_limit: f64,
    pub disk_mb: u64,
    pub port: u16,
    #[serde(default = "default_players")]
    pub max_players: u32,
    #[serde(default = "default_motd")]
    pub motd: String,
    #[serde(default)]
    pub java: Option<u8>,
    #[serde(default)]
    pub modpack: Option<String>,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    pub accept_eula: bool,
}

fn local_node() -> String {
    "local".into()
}
fn default_players() -> u32 {
    20
}
fn default_motd() -> String {
    "A world worth building. Powered by Emberdeck.".into()
}

impl ServerInput {
    pub fn validate(&self) -> Result<()> {
        require(
            self.accept_eula,
            "Accept the Minecraft EULA before creating a server",
        )?;
        require(
            !self.name.trim().is_empty()
                && self.name.len() <= 80
                && !self.name.contains(['\n', '\r']),
            "Name must contain 1–80 characters",
        )?;
        require(
            self.version.len() <= 32
                && self
                    .version
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || ".-_".contains(c)),
            "Invalid Minecraft version",
        )?;
        require(
            self.loader_version.len() <= 64
                && self
                    .loader_version
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || ".-_+".contains(c)),
            "Invalid loader version",
        )?;
        require(
            (512..=262_144).contains(&self.memory_mb),
            "Memory must be between 512 and 262144 MiB",
        )?;
        require(
            self.cpu_limit.is_finite() && (0.25..=128.0).contains(&self.cpu_limit),
            "CPU limit must be between 0.25 and 128 cores",
        )?;
        require(
            (1024..=16_777_216).contains(&self.disk_mb),
            "Disk budget must be between 1 GiB and 16 TiB",
        )?;
        require(
            self.port >= 1024 && self.port != 2022 && self.port != 8080 && self.port != 8081,
            "Choose an unreserved port from 1024 to 65535",
        )?;
        require(
            (1..=10_000).contains(&self.max_players),
            "Invalid maximum player count",
        )?;
        require(
            self.motd.len() <= 256 && !self.motd.contains(['\n', '\r', '\0']),
            "MOTD must be a single line under 256 bytes",
        )?;
        require(
            self.java.is_none_or(|j| [8, 17, 21, 25].contains(&j)),
            "Supported Java versions: 8, 17, 21, 25",
        )?;
        let allowed = [
            "DIFFICULTY",
            "GAMEMODE",
            "VIEW_DISTANCE",
            "SIMULATION_DISTANCE",
            "PVP",
            "ALLOW_FLIGHT",
            "LEVEL_SEED",
            "LEVEL_TYPE",
            "ENABLE_WHITELIST",
            "ENFORCE_WHITELIST",
            "ONLINE_MODE",
        ];
        for (key, value) in &self.environment {
            require(
                allowed.contains(&key.as_str()),
                &format!("Environment variable {key} is not permitted"),
            )?;
            require(
                value.len() <= 128 && !value.contains(['\n', '\r', '\0']),
                "Invalid environment value",
            )?;
        }
        if let Some(modpack) = &self.modpack {
            require(
                ["fabric", "forge", "neoforge", "quilt"].contains(&self.template.as_str()),
                "Modrinth modpacks require a Fabric, Forge, NeoForge or Quilt blueprint",
            )?;
            require(
                !modpack.is_empty()
                    && modpack.len() < 100
                    && modpack
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || "-_".contains(c)),
                "Use a Modrinth modpack project ID or slug",
            )?;
        }
        crate::templates::get(&self.template)?;
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    #[serde(flatten)]
    pub config: ServerInput,
    pub created_at: i64,
}

impl Server {
    pub fn container_name(&self) -> String {
        format!("emberdeck-{}", self.id)
    }
    pub fn java(&self) -> u8 {
        self.config.java.unwrap_or_else(|| {
            let parts: Vec<u32> = self
                .config
                .version
                .split('.')
                .filter_map(|v| v.parse().ok())
                .collect();
            match parts.as_slice() {
                [1, minor, ..] if *minor <= 16 => 8,
                [1, minor, ..] if *minor <= 19 => 17,
                [1, 20, patch] if *patch < 5 => 17,
                [1, 20] => 17,
                [major, ..] if *major >= 26 => 25,
                _ => 21,
            }
        })
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Players {
    pub online: u32,
    pub max: u32,
    pub names: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub state: String,
    pub cpu_percent: f64,
    pub memory_bytes: u64,
    pub disk_bytes: u64,
    pub players: Option<Players>,
    pub motd: String,
    pub started_at: Option<String>,
    pub at: i64,
    pub error: Option<String>,
}

impl Snapshot {
    pub fn offline(motd: &str) -> Self {
        Self {
            state: "offline".into(),
            cpu_percent: 0.0,
            memory_bytes: 0,
            disk_bytes: 0,
            players: None,
            motd: motd.into(),
            started_at: None,
            at: crate::store::now(),
            error: None,
        }
    }
}

pub fn valid_id(id: &str) -> Result<()> {
    require(
        !id.is_empty()
            && id.len() <= 64
            && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
        "Invalid identifier",
    )
}
