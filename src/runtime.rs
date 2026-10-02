use crate::{
    config::Config,
    error::{Error, Result, require},
    models::{Players, Server, Snapshot},
    templates,
};
use futures_util::StreamExt;
use reqwest::{Client, Method};
use serde_json::{Value, json};
use std::{path::Path, time::Duration};

#[derive(Clone)]
pub struct Docker {
    client: Client,
    supported: bool,
}

impl Docker {
    pub fn new(config: &Config) -> Result<Self> {
        let builder = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(600));
        #[cfg(unix)]
        let builder = builder.unix_socket(config.docker_socket.clone());
        #[cfg(not(unix))]
        let _ = config;
        Ok(Self {
            client: builder.build()?,
            supported: cfg!(unix),
        })
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> Result<reqwest::Response> {
        if !self.supported {
            return Err(Error::bad(
                "The Docker agent requires Linux. The panel and CLI also run on Windows.",
            ));
        }
        let mut request = self
            .client
            .request(method, format!("http://localhost/v1.47{path}"));
        if let Some(body) = body {
            request = request.json(body);
        }
        Ok(request.send().await?)
    }

    async fn checked(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> Result<reqwest::Response> {
        let response = self.send(method, path, body).await?;
        if response.status().is_success() || response.status().as_u16() == 304 {
            return Ok(response);
        }
        let status = response.status();
        let data: Value = response.json().await?;
        Err(Error::Upstream(format!(
            "Docker {status}: {}",
            data["message"].as_str().unwrap_or("request failed")
        )))
    }

    pub async fn info(&self) -> Result<Value> {
        Ok(self
            .checked(Method::GET, "/info", None)
            .await?
            .json()
            .await?)
    }

    pub async fn inspect(&self, server: &Server) -> Result<Option<Value>> {
        let response = self
            .send(
                Method::GET,
                &format!("/containers/{}/json", server.container_name()),
                None,
            )
            .await?;
        if response.status().as_u16() == 404 {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(Error::Upstream(format!(
                "Docker inspect returned {}",
                response.status()
            )));
        }
        let data: Value = response.json().await?;
        require(
            data["Config"]["Labels"]["dev.emberdeck.server"].as_str() == Some(&server.id),
            "Container is not owned by this server",
        )?;
        Ok(Some(data))
    }

    async fn image(&self, java: u8) -> Result<()> {
        let image = format!("itzg/minecraft-server:java{java}");
        let response = self
            .send(Method::GET, &format!("/images/{image}/json"), None)
            .await?;
        if response.status().is_success() {
            return Ok(());
        }
        if response.status().as_u16() != 404 {
            return Err(Error::Upstream(
                "Cannot inspect Minecraft runtime image".into(),
            ));
        }
        let response = self
            .checked(
                Method::POST,
                &format!("/images/create?fromImage=itzg/minecraft-server&tag=java{java}"),
                None,
            )
            .await?;
        let mut stream = response.bytes_stream();
        let mut pending = Vec::new();
        while let Some(chunk) = stream.next().await {
            pending.extend_from_slice(&chunk?);
            while let Some(index) = pending.iter().position(|b| *b == b'\n') {
                let line = pending.drain(..=index).collect::<Vec<_>>();
                if let Ok(progress) = serde_json::from_slice::<Value>(&line)
                    && let Some(error) = progress["error"].as_str()
                {
                    return Err(Error::Upstream(format!("Image pull failed: {error}")));
                }
            }
            require(
                pending.len() <= 1024 * 1024,
                "Docker image response exceeded its limit",
            )?;
        }
        Ok(())
    }

    async fn network(&self, server: &Server) -> Result<String> {
        let name = server.container_name();
        let response = self
            .send(Method::GET, &format!("/networks/{name}"), None)
            .await?;
        if response.status().as_u16() == 404 {
            self.checked(Method::POST,"/networks/create",Some(&json!({"Name":name,"Driver":"bridge","Labels":{"dev.emberdeck.server":server.id},"Options":{"com.docker.network.bridge.enable_icc":"false"}}))).await?;
        } else {
            let network: Value = response.error_for_status()?.json().await?;
            require(
                network["Labels"]["dev.emberdeck.server"] == server.id,
                "Network is not owned by this server",
            )?;
        }
        Ok(name)
    }

    pub async fn start(
        &self,
        server: &Server,
        directory: &Path,
        rcon_secret: &str,
        config: &Config,
        publish: bool,
    ) -> Result<()> {
        if let Some(info) = self.inspect(server).await? {
            if info["State"]["Running"].as_bool() == Some(true) {
                return Ok(());
            }
        } else {
            self.image(server.java()).await?;
            let network = self.network(server).await?;
            let body = container_config(server, directory, rcon_secret, config, &network, publish)?;
            self.checked(
                Method::POST,
                &format!("/containers/create?name={}", server.container_name()),
                Some(&body),
            )
            .await?;
        }
        self.checked(
            Method::POST,
            &format!("/containers/{}/start", server.container_name()),
            None,
        )
        .await?;
        Ok(())
    }

    pub async fn stop(&self, server: &Server) -> Result<()> {
        if let Some(info) = self.inspect(server).await?
            && info["State"]["Running"].as_bool() == Some(true)
        {
            self.checked(
                Method::POST,
                &format!("/containers/{}/stop?t=60", server.container_name()),
                None,
            )
            .await?;
        }
        Ok(())
    }

    pub async fn remove(&self, server: &Server) -> Result<()> {
        if self.inspect(server).await?.is_some() {
            self.stop(server).await?;
            self.checked(
                Method::DELETE,
                &format!("/containers/{}", server.container_name()),
                None,
            )
            .await?;
        }
        let response = self
            .send(
                Method::DELETE,
                &format!("/networks/{}", server.container_name()),
                None,
            )
            .await?;
        if !response.status().is_success() && response.status().as_u16() != 404 {
            return Err(Error::Upstream(
                "Could not remove the server network".into(),
            ));
        }
        Ok(())
    }

    pub async fn command(&self, server: &Server, command: &str) -> Result<String> {
        require(
            !command.trim().is_empty()
                && command.len() <= 2000
                && !command.contains(['\n', '\r', '\0']),
            "Command must be a single line under 2000 bytes",
        )?;
        let info = self
            .inspect(server)
            .await?
            .ok_or_else(|| Error::Conflict("Server has not been started".into()))?;
        if info["State"]["Running"].as_bool() != Some(true) {
            return Err(Error::Conflict("Server is offline".into()));
        }
        let created: Value = self
            .checked(
                Method::POST,
                &format!("/containers/{}/exec", server.container_name()),
                Some(&json!({"AttachStdout":true,"AttachStderr":true,"Cmd":["rcon-cli",command]})),
            )
            .await?
            .json()
            .await?;
        let id = created["Id"]
            .as_str()
            .ok_or_else(|| Error::Upstream("Docker did not return an exec ID".into()))?;
        let output = self
            .checked(
                Method::POST,
                &format!("/exec/{id}/start"),
                Some(&json!({"Detach":false,"Tty":false})),
            )
            .await?
            .bytes()
            .await?;
        let output = demux(&output);
        let result: Value = self
            .checked(Method::GET, &format!("/exec/{id}/json"), None)
            .await?
            .json()
            .await?;
        if result["ExitCode"].as_i64() != Some(0) {
            return Err(Error::Conflict(format!(
                "Console is not ready: {}",
                output.chars().take(500).collect::<String>()
            )));
        }
        Ok(output)
    }

    pub async fn logs(&self, server: &Server, tail: u32) -> Result<String> {
        if self.inspect(server).await?.is_none() {
            return Ok("Server has not been started yet.\n".into());
        }
        let response = self
            .checked(
                Method::GET,
                &format!(
                    "/containers/{}/logs?stdout=true&stderr=true&timestamps=true&tail={}",
                    server.container_name(),
                    tail.clamp(1, 2000)
                ),
                None,
            )
            .await?;
        let bytes = response.bytes().await?;
        let text = demux(&bytes);
        Ok(text
            .chars()
            .rev()
            .take(256 * 1024)
            .collect::<String>()
            .chars()
            .rev()
            .collect())
    }

    pub async fn snapshot(&self, server: &Server) -> Result<Snapshot> {
        let mut snapshot = Snapshot::offline(&server.config.motd);
        let Some(info) = self.inspect(server).await? else {
            return Ok(snapshot);
        };
        snapshot.started_at = info["State"]["StartedAt"].as_str().map(String::from);
        if info["State"]["Running"].as_bool() != Some(true) {
            if info["State"]["ExitCode"]
                .as_i64()
                .is_some_and(|code| code != 0)
            {
                snapshot.state = "crashed".into();
                snapshot.error = Some(if info["State"]["OOMKilled"].as_bool() == Some(true) {
                    "Memory limit exceeded".into()
                } else {
                    format!("Process exited with code {}", info["State"]["ExitCode"])
                });
            }
            return Ok(snapshot);
        }
        snapshot.state = "starting".into();
        let stats: Value = self
            .checked(
                Method::GET,
                &format!("/containers/{}/stats?stream=false", server.container_name()),
                None,
            )
            .await?
            .json()
            .await?;
        let cpu = number(&stats, "/cpu_stats/cpu_usage/total_usage")
            - number(&stats, "/precpu_stats/cpu_usage/total_usage");
        let system = number(&stats, "/cpu_stats/system_cpu_usage")
            - number(&stats, "/precpu_stats/system_cpu_usage");
        if system > 0.0 {
            snapshot.cpu_percent =
                (cpu / system * number(&stats, "/cpu_stats/online_cpus") * 100.0).max(0.0);
        }
        snapshot.memory_bytes = stats["memory_stats"]["usage"]
            .as_u64()
            .unwrap_or(0)
            .saturating_sub(
                stats["memory_stats"]["stats"]["inactive_file"]
                    .as_u64()
                    .unwrap_or(0),
            );
        match tokio::time::timeout(Duration::from_secs(5), self.command(server, "list")).await {
            Ok(Ok(output)) => {
                if let Some(players) = parse_players(&output) {
                    snapshot.players = Some(players);
                    snapshot.state = "online".into();
                }
            }
            Ok(Err(error)) => {
                tracing::debug!(server=%server.id,%error,"Console still starting");
            }
            Err(_) => {
                tracing::debug!(server=%server.id,"Console status timed out");
            }
        }
        Ok(snapshot)
    }
}

fn number(value: &Value, path: &str) -> f64 {
    value.pointer(path).and_then(Value::as_f64).unwrap_or(0.0)
}

pub fn container_config(
    server: &Server,
    directory: &Path,
    secret: &str,
    config: &Config,
    network: &str,
    publish: bool,
) -> Result<Value> {
    let template = templates::get(&server.config.template)?;
    let memory = u64::from(server.config.memory_mb) * 1024 * 1024;
    let heap = server
        .config
        .memory_mb
        .saturating_sub(384.max(server.config.memory_mb / 8))
        .max(256);
    let mut env = vec![
        format!("TYPE={}", template.docker_type),
        format!("VERSION={}", server.config.version),
        "EULA=TRUE".into(),
        format!("MAX_MEMORY={heap}M"),
        "INIT_MEMORY=256M".into(),
        "ENABLE_RCON=true".into(),
        format!("RCON_PASSWORD={secret}"),
        format!("MAX_PLAYERS={}", server.config.max_players),
        format!("MOTD={}", server.config.motd),
        "TZ=UTC".into(),
        "OVERRIDE_SERVER_PROPERTIES=false".into(),
    ];
    if !server.config.loader_version.is_empty() {
        let key = match server.config.template.as_str() {
            "paper" | "folia" => "PAPER_BUILD",
            "purpur" => "PURPUR_BUILD",
            "fabric" => "FABRIC_LOADER_VERSION",
            "forge" => "FORGE_VERSION",
            "neoforge" => "NEOFORGE_VERSION",
            "quilt" => "QUILT_LOADER_VERSION",
            "arclight" => "ARCLIGHT_VERSION",
            _ => "VERSION",
        };
        env.push(format!("{key}={}", server.config.loader_version));
    }
    if let Some(project) = &server.config.modpack {
        env.retain(|s| !s.starts_with("TYPE="));
        env.extend([
            "TYPE=MODRINTH".into(),
            format!("MODRINTH_MODPACK={project}"),
            format!("MODRINTH_GAME_VERSION={}", server.config.version),
            format!("MODRINTH_LOADER={}", server.config.template),
        ]);
    }
    env.extend(
        server
            .config
            .environment
            .iter()
            .map(|(k, v)| format!("{k}={v}")),
    );
    let ports = if publish {
        json!({"25565/tcp":[{"HostIp":"0.0.0.0","HostPort":server.config.port.to_string()}]})
    } else {
        json!({})
    };
    Ok(
        json!({"Image":format!("itzg/minecraft-server:java{}",server.java()),"User":format!("{}:{}",config.container_uid,config.container_gid),"Env":env,"ExposedPorts":{"25565/tcp":{}},"Labels":{"dev.emberdeck.server":server.id,"dev.emberdeck.managed":"true"},"HostConfig":{"Binds":[format!("{}:/data:rw",directory.display())],"PortBindings":ports,"Memory":memory,"MemorySwap":memory,"NanoCpus":(server.config.cpu_limit*1e9) as i64,"PidsLimit":512,"CapDrop":["ALL"],"SecurityOpt":["no-new-privileges:true"],"ReadonlyRootfs":true,"Tmpfs":{"/tmp":"rw,nosuid,nodev,size=512m,mode=1777"},"NetworkMode":network,"RestartPolicy":{"Name":"no"},"LogConfig":{"Type":"json-file","Config":{"max-size":"10m","max-file":"3"}},"Ulimits":[{"Name":"nofile","Soft":8192,"Hard":8192}]}}),
    )
}

pub fn demux(input: &[u8]) -> String {
    let mut result = Vec::new();
    let mut offset = 0;
    while offset + 8 <= input.len()
        && input[offset] <= 2
        && input[offset + 1..offset + 4] == [0, 0, 0]
    {
        let size = u32::from_be_bytes([
            input[offset + 4],
            input[offset + 5],
            input[offset + 6],
            input[offset + 7],
        ]) as usize;
        if offset + 8 + size > input.len() {
            break;
        }
        result.extend_from_slice(&input[offset + 8..offset + 8 + size]);
        offset += 8 + size;
    }
    if offset < input.len() {
        result.extend_from_slice(&input[offset..]);
    }
    String::from_utf8_lossy(&result).into_owned()
}

pub fn parse_players(output: &str) -> Option<Players> {
    let pattern =
        regex::Regex::new(r"There are (\d+) of a max of (\d+) players online:\s*([^\r\n]*)")
            .ok()?;
    let capture = pattern.captures(output)?;
    let names = capture[3]
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(String::from)
        .collect();
    Some(Players {
        online: capture[1].parse().ok()?,
        max: capture[2].parse().ok()?,
        names,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_docker_stdout_and_stderr_frames() {
        assert_eq!(
            demux(&[
                1, 0, 0, 0, 0, 0, 0, 2, b'o', b'k', 2, 0, 0, 0, 0, 0, 0, 1, b'!'
            ]),
            "ok!"
        );
        assert_eq!(demux(b"plain console"), "plain console");
    }
    #[test]
    fn player_probe_distinguishes_empty_and_unknown() {
        assert_eq!(
            parse_players("There are 2 of a max of 20 players online: Steve, Alex\n")
                .unwrap()
                .names,
            vec!["Steve", "Alex"]
        );
        assert_eq!(
            parse_players("There are 0 of a max of 20 players online: ")
                .unwrap()
                .online,
            0
        );
        assert!(parse_players("RCON connection refused").is_none());
    }
}
