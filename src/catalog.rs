use crate::{
    config::Config,
    error::{Error, Result, require},
    files::{Files, WEB_FILE_LIMIT},
    models::Server,
    store::{Store, now},
    templates,
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256, Sha512};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    sync::Arc,
    time::Duration,
};

#[derive(Clone)]
pub struct Catalog {
    pub client: reqwest::Client,
    cache: Arc<DashMap<String, (i64, Value)>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PackageRecord {
    pub server_id: String,
    pub path: String,
    pub name: String,
    pub source: String,
    pub project_id: String,
    pub version_id: String,
    pub sha256: String,
    pub installed_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PackageInstall {
    pub project_id: String,
    pub version_id: String,
    pub kind: String,
}

pub async fn bounded_bytes(mut response: reqwest::Response, maximum: usize) -> Result<Vec<u8>> {
    require(
        response
            .content_length()
            .is_none_or(|length| length <= maximum as u64),
        "Remote file exceeds the size limit",
    )?;
    let mut output = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        require(
            output.len().saturating_add(chunk.len()) <= maximum,
            "Remote file exceeds the size limit",
        )?;
        output.extend_from_slice(&chunk);
    }
    Ok(output)
}

impl Catalog {
    pub fn new(config: &Config) -> Result<Self> {
        Ok(Self {
            client: config.http_client()?,
            cache: Arc::new(DashMap::new()),
        })
    }

    pub async fn json(&self, url: &str) -> Result<Value> {
        if let Some(entry) = self.cache.get(url)
            && entry.0 > now() - 900
        {
            return Ok(entry.1.clone());
        }
        let response = self
            .client
            .get(url)
            .timeout(Duration::from_secs(25))
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(Error::Upstream(format!(
                "Catalog provider returned {}",
                response.status()
            )));
        }
        let value: Value =
            serde_json::from_slice(&bounded_bytes(response, 16 * 1024 * 1024).await?)?;
        if self.cache.len() > 512 {
            self.cache.retain(|_, v| v.0 > now() - 900);
        }
        self.cache.insert(url.into(), (now(), value.clone()));
        Ok(value)
    }

    pub async fn versions(&self, template_id: &str) -> Result<Value> {
        templates::get(template_id)?;
        let mut versions: Vec<String> = match template_id {
            "paper"|"folia" => {
                let data = self.json(&format!("https://fill.papermc.io/v3/projects/{template_id}")).await?;
                data["versions"].as_object().into_iter().flat_map(|m| m.values()).flat_map(strings).collect()
            }
            "purpur" => strings(&self.json("https://api.purpurmc.org/v2/purpur").await?["versions"]),
            "fabric"|"quilt" => {
                let url = if template_id=="fabric" {"https://meta.fabricmc.net/v2/versions/game"} else {"https://meta.quiltmc.org/v3/versions/game"};
                self.json(url).await?.as_array().into_iter().flatten().filter(|v| v["stable"].as_bool()==Some(true)).filter_map(|v|v["version"].as_str().map(String::from)).collect()
            }
            "forge" => {
                self.json("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json").await?["promos"].as_object().into_iter().flat_map(|m|m.keys()).filter_map(|k| k.rsplit_once('-').map(|(v,_)|v.to_owned())).collect()
            }
            "neoforge" => {
                let data = self.json("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge").await?;
                strings(&data["versions"]).into_iter().filter_map(|v| {
                    let p: Vec<&str> = v.split('.').collect();
                    if p.len()<2 || p[0].parse::<u32>().ok()? < 20 { return None; }
                    Some(format!("1.{}.{}",p[0],p[1]))
                }).collect()
            }
            _ => {
                self.json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").await?["versions"].as_array().into_iter().flatten().filter(|v| v["type"]=="release").filter_map(|v|v["id"].as_str().map(String::from)).collect()
            }
        };
        versions.sort_by_cached_key(|v| {
            v.split('.')
                .map(|p| p.parse::<u32>().unwrap_or(0))
                .collect::<Vec<_>>()
        });
        versions.dedup();
        versions.reverse();
        Ok(
            json!({"template":template_id,"versions":versions,"experimental":template_id=="arclight"}),
        )
    }

    pub async fn loaders(&self, template_id: &str, version: &str) -> Result<Value> {
        crate::models::valid_id(&version.replace('.', "-"))?;
        let versions = match template_id {
            "paper" | "folia" => self
                .json(&format!(
                    "https://fill.papermc.io/v3/projects/{template_id}/versions/{version}/builds"
                ))
                .await?
                .as_array()
                .into_iter()
                .flatten()
                .filter(|v| v["channel"] == "STABLE")
                .filter_map(|v| v["id"].as_u64().map(|id| id.to_string()))
                .collect::<Vec<_>>(),
            "purpur" => strings(
                &self
                    .json(&format!("https://api.purpurmc.org/v2/purpur/{version}"))
                    .await?["builds"]["all"],
            )
            .into_iter()
            .rev()
            .collect(),
            "fabric" | "quilt" => {
                let base = if template_id == "fabric" {
                    "https://meta.fabricmc.net/v2"
                } else {
                    "https://meta.quiltmc.org/v3"
                };
                self.json(&format!("{base}/versions/loader/{version}"))
                    .await?
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|v| v["loader"]["version"].as_str().map(String::from))
                    .collect()
            }
            "forge" => {
                let data = self.json("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json").await?;
                ["recommended", "latest"]
                    .iter()
                    .filter_map(|suffix| {
                        data["promos"][format!("{version}-{suffix}")]
                            .as_str()
                            .map(String::from)
                    })
                    .collect()
            }
            _ => Vec::new(),
        };
        Ok(json!({"versions":versions}))
    }

    pub async fn search(&self, server: &Server, kind: &str, query: &str) -> Result<Value> {
        require(query.len() <= 120, "Search query is too long")?;
        let loaders = templates::package_loaders(&templates::get(&server.config.template)?, kind)?;
        let facets = json!([
            [format!("project_type:{kind}")],
            [format!("versions:{}", server.config.version)],
            loaders
                .iter()
                .map(|l| format!("categories:{l}"))
                .collect::<Vec<_>>(),
            ["server_side:required", "server_side:optional"]
        ]);
        let url = reqwest::Url::parse_with_params(
            "https://api.modrinth.com/v2/search",
            &[
                ("query", query.to_owned()),
                ("limit", "24".into()),
                ("facets", facets.to_string()),
                ("index", "downloads".into()),
            ],
        )
        .map_err(anyhow::Error::from)?;
        let mut response = self.json(url.as_str()).await?;
        response["source"] = json!("Modrinth");
        Ok(response)
    }

    pub async fn project_versions(
        &self,
        server: &Server,
        kind: &str,
        project: &str,
    ) -> Result<Value> {
        project_id(project)?;
        let loaders = templates::package_loaders(&templates::get(&server.config.template)?, kind)?;
        let url = reqwest::Url::parse_with_params(
            &format!("https://api.modrinth.com/v2/project/{project}/version"),
            &[
                ("loaders", json!(loaders).to_string()),
                ("game_versions", json!([server.config.version]).to_string()),
            ],
        )
        .map_err(anyhow::Error::from)?;
        self.json(url.as_str()).await
    }

    pub async fn download(
        &self,
        url: &str,
        expected_sha512: Option<&str>,
        expected_sha256: Option<&str>,
    ) -> Result<Vec<u8>> {
        let mut target = reqwest::Url::parse(url).map_err(anyhow::Error::from)?;
        let hosts = [
            "cdn.modrinth.com",
            "github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
        ];
        for _ in 0..5 {
            require(
                target.scheme() == "https"
                    && target.port_or_known_default() == Some(443)
                    && target.username().is_empty()
                    && target.password().is_none()
                    && target.host_str().is_some_and(|h| hosts.contains(&h)),
                "Download URL is not an approved HTTPS source",
            )?;
            let response = self.client.get(target.clone()).send().await?;
            if response.status().is_redirection() {
                let location = response
                    .headers()
                    .get("location")
                    .and_then(|h| h.to_str().ok())
                    .ok_or_else(|| Error::Upstream("Download redirect has no location".into()))?;
                target = target.join(location).map_err(anyhow::Error::from)?;
                continue;
            }
            if !response.status().is_success() {
                return Err(Error::Upstream(format!(
                    "Download failed: {}",
                    response.status()
                )));
            }
            let bytes = bounded_bytes(response, WEB_FILE_LIMIT).await?;
            if let Some(hash) = expected_sha512 {
                require(
                    hex::encode(Sha512::digest(&bytes)) == hash,
                    "Package SHA-512 checksum does not match the publisher",
                )?;
            }
            if let Some(hash) = expected_sha256 {
                require(
                    hex::encode(Sha256::digest(&bytes)) == hash,
                    "Package SHA-256 checksum does not match the publisher",
                )?;
            }
            return Ok(bytes);
        }
        Err(Error::Upstream("Too many download redirects".into()))
    }

    pub async fn install(
        &self,
        server: &Server,
        files: &Files,
        store: &Store,
        request: &PackageInstall,
    ) -> Result<Value> {
        require(
            request.kind == "plugin" || request.kind == "mod",
            "Install modpacks when creating a new server",
        )?;
        project_id(&request.project_id)?;
        project_id(&request.version_id)?;
        let loaders =
            templates::package_loaders(&templates::get(&server.config.template)?, &request.kind)?;
        let directory = if request.kind == "plugin" {
            "plugins"
        } else {
            "mods"
        };
        let mut queue = VecDeque::from([(request.project_id.clone(), request.version_id.clone())]);
        let mut visited = BTreeSet::new();
        let mut staged: Vec<(PackageRecord, Vec<u8>)> = Vec::new();
        let mut reviews = Vec::new();
        while let Some((project, version)) = queue.pop_front() {
            if !visited.insert(version.clone()) {
                continue;
            }
            require(visited.len() <= 64, "Dependency graph is too large")?;
            let metadata = self
                .json(&format!("https://api.modrinth.com/v2/version/{version}"))
                .await?;
            require(
                metadata["project_id"] == project,
                "Version does not belong to the requested project",
            )?;
            require(
                strings(&metadata["game_versions"]).contains(&server.config.version),
                "Package does not support this Minecraft version",
            )?;
            require(
                strings(&metadata["loaders"])
                    .iter()
                    .any(|l| loaders.contains(l)),
                "Package loader is incompatible with this server",
            )?;
            for dependency in metadata["dependencies"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|d| d["dependency_type"] == "required")
            {
                let dependency_version = if let Some(id) = dependency["version_id"].as_str() {
                    self.json(&format!("https://api.modrinth.com/v2/version/{id}"))
                        .await?
                } else if let Some(id) = dependency["project_id"].as_str() {
                    self.project_versions(server, &request.kind, id)
                        .await?
                        .as_array()
                        .and_then(|v| v.first())
                        .cloned()
                        .ok_or_else(|| {
                            Error::bad(format!("No compatible version of required dependency {id}"))
                        })?
                } else {
                    return Err(Error::bad(
                        "A required external dependency must be installed manually",
                    ));
                };
                queue.push_back((
                    field(&dependency_version, "project_id")?,
                    field(&dependency_version, "id")?,
                ));
            }
            let candidates = metadata["files"]
                .as_array()
                .ok_or_else(|| Error::Upstream("Package has no downloadable files".into()))?;
            let file = candidates
                .iter()
                .find(|f| f["primary"] == true)
                .or_else(|| candidates.first())
                .ok_or_else(|| Error::bad("Package has no file"))?;
            let filename = field(file, "filename")?;
            valid_jar_name(&filename)?;
            let sha512 = file["hashes"]["sha512"]
                .as_str()
                .ok_or_else(|| Error::bad("Publisher did not provide a SHA-512 checksum"))?;
            let bytes = self
                .download(&field(file, "url")?, Some(sha512), None)
                .await?;
            let path = format!("{directory}/{filename}");
            let hash = hex::encode(Sha256::digest(&bytes));
            reviews.push(crate::security::scan_jar(
                std::io::Cursor::new(&bytes),
                &path,
                &hash,
            )?);
            let previous = store
                .list::<PackageRecord>("package")?
                .into_iter()
                .find(|p| p.server_id == server.id && p.project_id == project);
            if let Some(previous) = previous {
                if previous.version_id == version && files.dir.try_exists(&previous.path)? {
                    continue;
                }
                return Err(Error::Conflict(format!(
                    "{} is already installed. Remove its old JAR before changing versions.",
                    previous.name
                )));
            }
            require(
                !files.dir.try_exists(&path)?,
                "A file with this package name already exists",
            )?;
            staged.push((
                PackageRecord {
                    server_id: server.id.clone(),
                    path,
                    name: field(&metadata, "name")?,
                    source: "modrinth".into(),
                    project_id: project,
                    version_id: version,
                    sha256: hex::encode(Sha256::digest(&bytes)),
                    installed_at: now(),
                },
                bytes,
            ));
        }
        let added_size: u64 = staged.iter().map(|(_, bytes)| bytes.len() as u64).sum();
        require(
            files.size()?.saturating_add(added_size) <= server.config.disk_mb * 1024 * 1024,
            "Server disk budget would be exceeded",
        )?;
        if !files.dir.try_exists(directory)? {
            files.mkdir(directory)?;
        }
        let mut installed = Vec::new();
        for (record, bytes) in staged {
            files.write(&record.path, &bytes, None)?;
            store.put(
                "package",
                &format!("{}:{}", server.id, record.path),
                &record,
            )?;
            installed.push(record);
        }
        Ok(json!({"installed":installed,"restart_required":true,"security_reviews":reviews}))
    }

    pub async fn github_releases(&self, repository: &str) -> Result<Value> {
        repository_id(repository)?;
        let releases = self
            .json(&format!(
                "https://api.github.com/repos/{repository}/releases?per_page=20"
            ))
            .await?;
        Ok(
            json!({"releases":releases,"compatibility":"Manual: GitHub releases do not declare Minecraft or loader compatibility."}),
        )
    }

    pub async fn install_github(
        &self,
        server: &Server,
        files: &Files,
        store: &Store,
        repository: &str,
        asset_id: u64,
        kind: &str,
    ) -> Result<Value> {
        repository_id(repository)?;
        templates::package_loaders(&templates::get(&server.config.template)?, kind)?;
        require(
            kind == "mod" || kind == "plugin",
            "GitHub installation supports JARs only",
        )?;
        let asset = self
            .json(&format!(
                "https://api.github.com/repos/{repository}/releases/assets/{asset_id}"
            ))
            .await?;
        let filename = field(&asset, "name")?;
        valid_jar_name(&filename)?;
        let checksum = asset["digest"]
            .as_str()
            .and_then(|d| d.strip_prefix("sha256:"));
        let bytes = self
            .download(&field(&asset, "browser_download_url")?, None, checksum)
            .await?;
        require(
            files.size()?.saturating_add(bytes.len() as u64) <= server.config.disk_mb * 1024 * 1024,
            "Server disk budget would be exceeded",
        )?;
        let directory = if kind == "plugin" { "plugins" } else { "mods" };
        if !files.dir.try_exists(directory)? {
            files.mkdir(directory)?;
        }
        let path = format!("{directory}/{filename}");
        require(
            !files.dir.try_exists(&path)?,
            "A file with this name already exists",
        )?;
        let review = crate::security::scan_jar(
            std::io::Cursor::new(&bytes),
            &path,
            &hex::encode(Sha256::digest(&bytes)),
        )?;
        files.write(&path, &bytes, None)?;
        let record = PackageRecord {
            server_id: server.id.clone(),
            path,
            name: filename,
            source: "github".into(),
            project_id: repository.into(),
            version_id: asset_id.to_string(),
            sha256: hex::encode(Sha256::digest(&bytes)),
            installed_at: now(),
        };
        store.put(
            "package",
            &format!("{}:{}", server.id, record.path),
            &record,
        )?;
        Ok(
            json!({"installed":[record],"restart_required":true,"publisher_checksum":checksum.is_some(),"security_reviews":[review]}),
        )
    }
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v.as_str().map(String::from))
        .collect()
}
fn field(value: &Value, key: &str) -> Result<String> {
    value[key]
        .as_str()
        .map(String::from)
        .ok_or_else(|| Error::Upstream(format!("Missing catalog field: {key}")))
}
fn project_id(value: &str) -> Result<()> {
    require(
        !value.is_empty()
            && value.len() <= 100
            && value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_".contains(c)),
        "Invalid project/version identifier",
    )
}
fn repository_id(value: &str) -> Result<()> {
    let parts = value.split('/').collect::<Vec<_>>();
    require(parts.len() == 2, "Use owner/repository for GitHub sources")?;
    for part in parts {
        require(
            !part.is_empty()
                && part.len() <= 100
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
                && part != "..",
            "Invalid GitHub repository",
        )?;
    }
    Ok(())
}
pub fn valid_jar_name(name: &str) -> Result<()> {
    require(
        name.len() <= 200
            && name.ends_with(".jar")
            && !name.contains(['/', '\\', ':', '\0'])
            && name != ".jar",
        "Expected a plain JAR filename",
    )
}

pub fn installed(files: &Files, store: &Store, server: &Server) -> Result<Value> {
    let records: BTreeMap<String, PackageRecord> = store
        .list::<PackageRecord>("package")?
        .into_iter()
        .filter(|p| p.server_id == server.id)
        .map(|p| (p.path.clone(), p))
        .collect();
    let mut entries = Vec::new();
    for (directory, kind) in [("plugins", "plugin"), ("mods", "mod")] {
        if !files.dir.try_exists(directory)? {
            continue;
        }
        for entry in files.list(directory)?.into_iter().filter(|e| {
            !e.is_dir && (e.name.ends_with(".jar") || e.name.ends_with(".jar.disabled"))
        }) {
            let normal = entry.path.trim_end_matches(".disabled");
            entries.push(json!({"name":entry.name,"path":entry.path,"kind":kind,"enabled":!entry.name.ends_with(".disabled"),"size":entry.size,"source":records.get(normal).map(|r|r.source.as_str()).unwrap_or("upload"),"metadata":records.get(normal)}));
        }
    }
    Ok(json!({"packages":entries}))
}
