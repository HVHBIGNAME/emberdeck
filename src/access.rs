use crate::{
    config::Config,
    error::{Error, Result, require},
};
use clap::{Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::{Path, PathBuf},
    process::Stdio,
};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Local,
    Quick,
    Cloudflare,
    Caddy,
    Proxy,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Quick => "quick",
            Self::Cloudflare => "cloudflare",
            Self::Caddy => "caddy",
            Self::Proxy => "proxy",
        }
    }
}

#[derive(Subcommand)]
pub enum Command {
    /// Inspect connection settings without exposing credentials.
    Inspect {
        #[arg(long, default_value = "/etc/emberdeck/panel.toml")]
        config: PathBuf,
        #[arg(long, value_enum)]
        field: Option<Field>,
    },
    /// Install or switch a Linux access service. Run as root.
    Install {
        #[arg(long, value_enum)]
        mode: Mode,
        #[arg(long)]
        public_url: Option<String>,
        #[arg(long)]
        token_file: Option<PathBuf>,
    },
    /// Update network configuration; the installer uses this before restarting the panel.
    Configure {
        #[arg(long, default_value = "/etc/emberdeck/panel.toml")]
        config: PathBuf,
        #[arg(long, value_enum)]
        mode: Mode,
        #[arg(long)]
        public_url: Option<String>,
        #[arg(long)]
        url_file: Option<PathBuf>,
        #[arg(long)]
        check: bool,
    },
    /// Supervise a cloudflared process and publish its current quick-tunnel URL.
    Tunnel(crate::tunnel::Options),
}

#[derive(Clone, Copy, ValueEnum)]
pub enum Field {
    Origin,
    Url,
    Mode,
    Host,
    Instance,
}

pub async fn run(command: Command) -> anyhow::Result<()> {
    match command {
        Command::Inspect { config, field } => {
            let config = Config::load(&config)?;
            match field {
                Some(Field::Origin) => {
                    println!("{}", origin(&config)?);
                    return Ok(());
                }
                Some(Field::Mode) => {
                    println!("{}", config.access_mode.as_str());
                    return Ok(());
                }
                Some(Field::Instance) => {
                    println!("{}", installation_id(&config));
                    return Ok(());
                }
                _ => {}
            }
            let data = view(&config)?;
            if let Some(field) = field {
                let key = match field {
                    Field::Origin => "origin",
                    Field::Url => "public_url",
                    Field::Mode => "mode",
                    Field::Host => "hostname",
                    Field::Instance => "installation_id",
                };
                println!("{}", data[key].as_str().unwrap_or(""));
            } else {
                println!("{}", serde_json::to_string_pretty(&data)?);
            }
        }
        Command::Configure {
            config,
            mode,
            public_url,
            url_file,
            check,
        } => {
            configure(
                &config,
                mode,
                public_url.as_deref(),
                url_file.as_deref(),
                check,
            )?;
        }
        Command::Install {
            mode,
            public_url,
            token_file,
        } => {
            anyhow::ensure!(
                cfg!(target_os = "linux"),
                "Access services are installed on Linux. Use the web install guide for other hosts."
            );
            let mut child = tokio::process::Command::new("bash")
                .args([
                    "-s",
                    "--",
                    mode.as_str(),
                    public_url.as_deref().unwrap_or(""),
                ])
                .arg(token_file.unwrap_or_default())
                .env("EMBERDECK_BINARY", std::env::current_exe()?)
                .stdin(Stdio::piped())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .kill_on_drop(true)
                .spawn()?;
            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| anyhow::anyhow!("Cannot open installer input"))?;
            stdin
                .write_all(include_bytes!("../scripts/access-install.sh"))
                .await?;
            drop(stdin);
            anyhow::ensure!(
                child.wait().await?.success(),
                "Access setup failed; inspect the message above and the access service log."
            );
        }
        Command::Tunnel(options) => crate::tunnel::run(options).await?,
    }
    Ok(())
}

pub fn validate_url(input: &str, https: bool) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(input).map_err(|_| Error::bad("Enter a complete panel URL"))?;
    require(
        input.len() <= 512
            && input == input.trim()
            && !input.chars().any(char::is_control)
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && matches!(url.path(), "" | "/")
            && url.query().is_none()
            && url.fragment().is_none()
            && (url.scheme() == "https" || (!https && url.scheme() == "http")),
        "Use a root HTTP(S) URL without credentials, paths or query parameters; public access requires HTTPS",
    )?;
    Ok(url)
}

pub fn origin(config: &Config) -> Result<String> {
    let mut address: SocketAddr = config
        .listen
        .parse()
        .map_err(|_| Error::bad("Panel listen must be an IP address and port"))?;
    if address.ip().is_unspecified() {
        address.set_ip(if address.is_ipv4() {
            IpAddr::V4(Ipv4Addr::LOCALHOST)
        } else {
            IpAddr::V6(Ipv6Addr::LOCALHOST)
        });
    }
    require(address.port() != 0, "Panel port cannot be zero")?;
    Ok(format!("http://{address}"))
}

pub fn public_url(config: &Config) -> Result<Option<String>> {
    if let Some(path) = &config.public_url_file {
        let file = match fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let mut text = String::new();
        file.take(513).read_to_string(&mut text)?;
        let url = validate_url(text.trim(), true)?;
        if config.access_mode == Mode::Quick {
            require(
                url.host_str()
                    .is_some_and(|h| h.ends_with(".trycloudflare.com")),
                "Unexpected quick-tunnel hostname",
            )?;
        }
        return Ok(Some(url.as_str().trim_end_matches('/').to_owned()));
    }
    Ok(Some(config.public_url.clone()))
}

pub fn view(config: &Config) -> Result<Value> {
    let url = public_url(config)?;
    let hostname = url
        .as_deref()
        .and_then(|value| reqwest::Url::parse(value).ok())
        .and_then(|url| url.host_str().map(str::to_owned));
    Ok(
        json!({"mode":config.access_mode,"origin":origin(config)?,"public_url":url,"hostname":hostname,
        "secure_cookies":config.secure_cookies(),"ephemeral":config.access_mode == Mode::Quick,
        "installation_id":installation_id(config), "version":env!("CARGO_PKG_VERSION")}),
    )
}

pub fn installation_id(config: &Config) -> String {
    crate::auth::digest(&format!(
        "emberdeck-installation:{}",
        config.master_token_hash
    ))
}

pub fn configure(
    path: &Path,
    mode: Mode,
    url: Option<&str>,
    url_file: Option<&Path>,
    check: bool,
) -> Result<()> {
    let input = fs::read_to_string(path)?;
    let config: Config = toml::from_str(&input).map_err(anyhow::Error::from)?;
    let mut listen: SocketAddr = config
        .listen
        .parse()
        .map_err(|_| Error::bad("Invalid panel listen address"))?;
    listen.set_ip(if listen.is_ipv4() {
        IpAddr::V4(Ipv4Addr::LOCALHOST)
    } else {
        IpAddr::V6(Ipv6Addr::LOCALHOST)
    });
    let public = match mode {
        Mode::Local => format!("http://localhost:{}", listen.port()),
        Mode::Quick => {
            require(
                url_file.is_some_and(Path::is_absolute),
                "Quick tunnels require an absolute --url-file path",
            )?;
            "https://localhost".into()
        }
        _ => {
            let url = validate_url(
                url.ok_or_else(|| Error::bad("Set --public-url to your HTTPS hostname"))?,
                true,
            )?;
            if mode == Mode::Caddy {
                require(
                    url.port_or_known_default() == Some(443)
                        && url.domain().is_some_and(|h| {
                            h.contains('.')
                                && h.bytes()
                                    .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
                        }),
                    "Managed Caddy requires a DNS hostname on HTTPS port 443",
                )?;
            }
            url.as_str().trim_end_matches('/').to_owned()
        }
    };
    if check {
        return Ok(());
    }
    let mut document: toml_edit::DocumentMut = input.parse().map_err(anyhow::Error::from)?;
    document["listen"] = toml_edit::value(listen.to_string());
    document["public_url"] = toml_edit::value(public);
    document["access_mode"] = toml_edit::value(mode.as_str());
    document.remove("public_url_file");
    if mode == Mode::Quick {
        document["public_url_file"] = toml_edit::value(
            url_file
                .ok_or_else(|| Error::bad("Missing URL file"))?
                .to_string_lossy()
                .as_ref(),
        );
    }
    replace_config(path, document.to_string().as_bytes())
}

fn replace_config(path: &Path, contents: &[u8]) -> Result<()> {
    let metadata = fs::metadata(path)?;
    let temporary = path.with_file_name(format!(".emberdeck-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<()> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(contents)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::{MetadataExt, PermissionsExt};
            rustix::fs::fchown(
                &file,
                Some(rustix::fs::Uid::from_raw(metadata.uid())),
                Some(rustix::fs::Gid::from_raw(metadata.gid())),
            )
            .map_err(std::io::Error::from)?;
            file.set_permissions(fs::Permissions::from_mode(metadata.mode() & 0o640))?;
        }
        #[cfg(not(unix))]
        {
            file.set_permissions(metadata.permissions())?;
        }
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err()
        && let Err(error) = fs::remove_file(&temporary)
    {
        tracing::debug!(%error, "No configuration staging file to remove");
    }
    result
}

pub fn client_ip(peer: IpAddr, headers: &axum::http::HeaderMap, mode: Mode) -> IpAddr {
    if !peer.is_loopback() {
        return peer;
    }
    let candidate = match mode {
        Mode::Quick | Mode::Cloudflare => headers
            .get("cf-connecting-ip")
            .and_then(|v| v.to_str().ok()),
        Mode::Caddy | Mode::Proxy => headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit(',').next()),
        Mode::Local => None,
    };
    candidate
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(peer)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configuration_preserves_secrets_comments_and_supports_hot_tunnel_urls() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("panel.toml");
        let url_file = temp.path().join("public-url");
        let input = "# Keep this operator note\nlisten = '192.0.2.25:18080'\npublic_url = 'http://localhost:18080'\nagent_token = 'secret-preserved'\n";
        fs::write(&path, input).unwrap();
        configure(&path, Mode::Quick, None, Some(&url_file), true).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), input);
        configure(&path, Mode::Quick, None, Some(&url_file), false).unwrap();
        let updated = fs::read_to_string(&path).unwrap();
        assert!(updated.contains("# Keep this operator note"));
        let config: Config = toml::from_str(&updated).unwrap();
        assert_eq!(config.agent_token, "secret-preserved");
        assert_eq!(origin(&config).unwrap(), "http://127.0.0.1:18080");
        assert!(config.secure_cookies());
        assert!(public_url(&config).unwrap().is_none());
        fs::write(&url_file, "https://first-world.trycloudflare.com\n").unwrap();
        assert_eq!(
            config.effective_public_url().unwrap(),
            "https://first-world.trycloudflare.com"
        );
        fs::write(&url_file, "https://next-world.trycloudflare.com\n").unwrap();
        assert_eq!(
            config.effective_public_url().unwrap(),
            "https://next-world.trycloudflare.com"
        );
        configure(&path, Mode::Local, None, None, false).unwrap();
        let local: Config = toml::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(!local.secure_cookies());
        assert!(local.public_url_file.is_none());
    }
    #[test]
    fn rejects_unsafe_public_urls_and_untrusted_forwarding_headers() {
        for url in [
            "http://panel.example.com",
            "https://user:secret@example.com",
            "https://example.com/admin",
            "https://example.com/?token=x",
            "https://panel.example.com\n",
            "https://pan\nel.example.com",
            "file:///etc/passwd",
        ] {
            assert!(validate_url(url, true).is_err());
        }
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("cf-connecting-ip", "203.0.113.42".parse().unwrap());
        let loopback = "127.0.0.1".parse().unwrap();
        let direct = "192.0.2.10".parse().unwrap();
        assert_eq!(
            client_ip(loopback, &headers, Mode::Quick),
            "203.0.113.42".parse::<IpAddr>().unwrap()
        );
        assert_eq!(client_ip(loopback, &headers, Mode::Local), loopback);
        assert_eq!(client_ip(direct, &headers, Mode::Quick), direct);
    }
}
