use anyhow::{Context, ensure};
use clap::Args;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::LazyLock,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Command,
};

#[derive(Args)]
pub struct Options {
    #[arg(long, default_value = "/usr/local/lib/emberdeck/cloudflared")]
    cloudflared: PathBuf,
    #[arg(long)]
    origin: String,
    #[arg(long, default_value = "/var/lib/emberdeck/tunnel")]
    state_dir: PathBuf,
    #[arg(long)]
    token_file: Option<PathBuf>,
    #[arg(long)]
    check: bool,
}

fn quick_url(line: &str) -> Option<&str> {
    static URL: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(
            r#"(?P<url>https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com)/?(?:[\s"|\\]|$)"#,
        )
        .expect("constant quick tunnel URL pattern")
    });
    URL.captures(line)?.name("url").map(|m| m.as_str())
}

fn save_url(directory: &Path, url: &str) -> anyhow::Result<()> {
    let temporary = directory.join(format!(".public-url-{}", uuid::Uuid::new_v4()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    writeln!(file, "{url}")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o644))?;
    }
    file.sync_all()?;
    drop(file);
    fs::rename(&temporary, directory.join("public-url"))?;
    println!("Public URL: {url}");
    Ok(())
}

async fn logs(reader: impl AsyncRead + Unpin, directory: Option<PathBuf>) -> anyhow::Result<()> {
    let mut lines = BufReader::new(reader).lines();
    while let Some(line) = lines.next_line().await? {
        ensure!(
            line.len() <= 64 * 1024,
            "cloudflared log line exceeds the limit"
        );
        if let Some(directory) = &directory
            && let Some(url) = quick_url(&line)
        {
            save_url(directory, url)?;
        }
        tracing::info!(message = %crate::security::redact(&line), "cloudflared");
    }
    Ok(())
}

pub async fn run(options: Options) -> anyhow::Result<()> {
    let origin = crate::access::validate_url(&options.origin, false)?;
    let host = origin.host_str().context("Missing origin host")?;
    let loopback = host
        .trim_matches(['[', ']'])
        .parse::<std::net::IpAddr>()
        .is_ok_and(|ip| ip.is_loopback());
    ensure!(
        origin.scheme() == "http" && loopback,
        "Tunnel origin must be a loopback HTTP listener"
    );
    ensure!(
        options.state_dir.is_absolute(),
        "Use an absolute state directory"
    );
    let quick = options.token_file.is_none();
    let mut command = Command::new(&options.cloudflared);
    command.args([
        "tunnel",
        "--no-autoupdate",
        "--output",
        "json",
        "--metrics",
        "127.0.0.1:0",
        "--management-diagnostics=false",
    ]);
    if let Some(path) = &options.token_file {
        ensure!(
            path.is_absolute() && path.is_file(),
            "Tunnel token file is missing"
        );
        command.args(["run", "--token-file"]).arg(path);
    } else {
        command.args(["--url", &options.origin]);
    }
    if options.check {
        let output = command.arg("--help").output().await?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        ensure!(
            output.status.success()
                && !text.contains("Incorrect Usage")
                && !text.contains("flag provided but not defined"),
            "cloudflared does not support the requested startup flags"
        );
        return Ok(());
    }
    fs::create_dir_all(&options.state_dir)?;
    if quick {
        match fs::remove_file(options.state_dir.join("public-url")) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let stdout = child.stdout.take().context("No cloudflared stdout")?;
    let stderr = child.stderr.take().context("No cloudflared stderr")?;
    let directory = quick.then_some(options.state_dir);
    let (status, (), ()) = tokio::try_join!(
        async { Ok::<_, anyhow::Error>(child.wait().await?) },
        logs(stdout, directory.clone()),
        logs(stderr, directory),
    )?;
    ensure!(status.success(), "cloudflared exited with {status}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publishes_only_exact_quick_tunnel_hosts() {
        assert_eq!(
            quick_url("| https://quiet-world.trycloudflare.com |"),
            Some("https://quiet-world.trycloudflare.com")
        );
        assert_eq!(
            quick_url(r#"{"url":"https://next-world.trycloudflare.com"}"#),
            Some("https://next-world.trycloudflare.com")
        );
        assert!(quick_url("https://fake.trycloudflare.com.attacker.test").is_none());
        assert!(quick_url("https://example.com").is_none());
        let directory = tempfile::tempdir().unwrap();
        save_url(directory.path(), "https://quiet-world.trycloudflare.com").unwrap();
        save_url(directory.path(), "https://next-world.trycloudflare.com").unwrap();
        assert_eq!(
            fs::read_to_string(directory.path().join("public-url")).unwrap(),
            "https://next-world.trycloudflare.com\n"
        );
    }
}
