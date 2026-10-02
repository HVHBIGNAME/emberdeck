use crate::{
    agent::Agent,
    error::{Error, Result, require},
    files::{Files, relative},
    models::{Server, valid_id},
    store::now,
};
use cap_std::fs::Dir;
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

#[derive(Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub size: u64,
    pub sha256: String,
    pub created_at: i64,
    pub destination: String,
    pub remote_state: String,
}

pub async fn create(agent: &Agent, server: &Server, destination: &str) -> Result<Backup> {
    require(
        destination == "local" || agent.config.backup_remotes.contains_key(destination),
        "Backup destination is not configured",
    )?;
    let files = agent.files(server)?;
    let root = agent.config.backup_dir.join(&server.id);
    fs::create_dir_all(&root)?;
    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{id}.tar.gz");
    let path = root.join(&filename);
    let archive_path = path.clone();
    let running = agent
        .docker
        .inspect(server)
        .await?
        .is_some_and(|v| v["State"]["Running"] == true);
    if running {
        agent.docker.command(server, "save-off").await?;
        if let Err(error) = agent.docker.command(server, "save-all flush").await {
            if let Err(resume) = agent.docker.command(server, "save-on").await {
                tracing::error!(%resume,"Could not re-enable world saves");
            }
            return Err(error);
        }
    }
    let result = tokio::task::spawn_blocking(move || pack(&files, &archive_path)).await;
    let resumed = if running {
        agent.docker.command(server, "save-on").await.map(|_| ())
    } else {
        Ok(())
    };
    let (size, sha256) = result.map_err(anyhow::Error::from)??;
    resumed?;
    let mut backup = Backup {
        id,
        server_id: server.id.clone(),
        name: format!(
            "{}-{}.tar.gz",
            server.config.name,
            chrono::Utc::now().format("%Y-%m-%d_%H-%M-%S")
        ),
        size,
        sha256,
        created_at: now(),
        destination: destination.into(),
        remote_state: if destination == "local" {
            "local"
        } else {
            "uploading"
        }
        .into(),
    };
    agent.store.put("backup", &backup.id, &backup)?;
    if destination != "local" {
        let remote = &agent.config.backup_remotes[destination];
        let target = format!(
            "{}/{}/{}",
            remote.trim_end_matches('/'),
            server.id,
            filename
        );
        let upload = upload(agent, &path, &target).await;
        backup.remote_state = if upload.is_ok() { "uploaded" } else { "failed" }.into();
        agent.store.put("backup", &backup.id, &backup)?;
        upload?;
    }
    Ok(backup)
}

async fn upload(agent: &Agent, path: &Path, target: &str) -> Result<()> {
    let mut command = tokio::process::Command::new("rclone");
    command
        .args(["copyto"])
        .arg(path)
        .arg(target)
        .args(["--retries", "2", "--contimeout", "15s", "--timeout", "5m"])
        .kill_on_drop(true);
    if let Some(config) = &agent.config.rclone_config {
        command.arg("--config").arg(config);
    }
    let output = tokio::time::timeout(std::time::Duration::from_secs(3600), command.output())
        .await
        .map_err(|_| {
            Error::Upstream("Remote backup upload timed out; the local backup was kept".into())
        })??;
    if !output.status.success() {
        return Err(Error::Upstream(format!(
            "rclone failed; local backup is preserved. {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(1000)
                .collect::<String>()
        )));
    }
    Ok(())
}

fn pack(files: &Files, output: &Path) -> Result<(u64, String)> {
    let partial = output.with_extension("partial");
    let result = (|| -> Result<(u64, String)> {
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&partial)?;
        let mut archive = tar::Builder::new(GzEncoder::new(file, Compression::fast()));
        append_tree(&mut archive, &files.dir, Path::new(""), 0)?;
        archive.into_inner()?.finish()?.sync_all()?;
        fs::rename(&partial, output)?;
        Ok((fs::metadata(output)?.len(), hash_file(output)?))
    })();
    if result.is_err()
        && let Err(error) = fs::remove_file(&partial)
    {
        tracing::debug!(%error,"No partial backup to remove");
    }
    result
}

fn append_tree<W: Write>(
    archive: &mut tar::Builder<W>,
    dir: &Dir,
    prefix: &Path,
    depth: usize,
) -> Result<()> {
    require(depth <= 64, "Backup directory depth limit exceeded")?;
    for entry in dir.entries()? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let path = prefix.join(entry.file_name());
        if kind.is_dir() {
            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Directory);
            header.set_size(0);
            header.set_mode(0o755);
            header.set_mtime(now() as u64);
            header.set_cksum();
            archive.append_data(&mut header, &path, std::io::empty())?;
            append_tree(archive, &entry.open_dir()?, &path, depth + 1)?;
        } else if kind.is_file() {
            let mut header = tar::Header::new_gnu();
            header.set_size(entry.metadata()?.len());
            header.set_mode(0o644);
            header.set_mtime(now() as u64);
            header.set_cksum();
            archive.append_data(&mut header, &path, entry.open()?)?;
        }
    }
    Ok(())
}

pub fn hash_file(path: &Path) -> Result<String> {
    let mut hasher = Sha256::new();
    std::io::copy(&mut fs::File::open(path)?, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

pub async fn restore(
    agent: &Agent,
    server: &Server,
    backup_id: &str,
    confirm: bool,
) -> Result<Value> {
    require(confirm, "Explicit restore confirmation is required")?;
    valid_id(backup_id)?;
    agent.require_stopped(server).await?;
    let backup: Backup = agent.store.need("backup", backup_id)?;
    require(
        backup.server_id == server.id,
        "Backup belongs to a different server",
    )?;
    let path = agent
        .config
        .backup_dir
        .join(&server.id)
        .join(format!("{backup_id}.tar.gz"));
    require(
        hash_file(&path)? == backup.sha256,
        "Backup checksum mismatch; restore refused",
    )?;
    let rollback = create(agent, server, "local").await?;
    let root = agent.server_path(server);
    let staging = agent
        .config
        .server_dir
        .join(format!("restore-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&staging)?;
    let files = Files::open(
        &staging,
        agent.config.container_uid,
        agent.config.container_gid,
    )?;
    files.own_dir(&files.dir)?;
    let limit = server.config.disk_mb * 1024 * 1024;
    let extraction = tokio::task::spawn_blocking(move || unpack(&path, &files, limit))
        .await
        .map_err(anyhow::Error::from)?;
    if let Err(error) = extraction {
        fs::remove_dir_all(&staging)?;
        return Err(error);
    }
    let old = agent
        .config
        .server_dir
        .join(format!("previous-{}", uuid::Uuid::new_v4()));
    fs::rename(&root, &old)?;
    if let Err(error) = fs::rename(&staging, &root) {
        fs::rename(&old, &root)?;
        return Err(error.into());
    }
    fs::remove_dir_all(&old)?;
    agent.docker.remove(server).await?;
    Ok(json!({"restored":backup_id,"rollback_backup":rollback.id}))
}

fn unpack(path: &Path, files: &Files, limit: u64) -> Result<()> {
    let mut archive = tar::Archive::new(GzDecoder::new(fs::File::open(path)?));
    let mut total = 0_u64;
    let mut count = 0_usize;
    for entry in archive.entries()? {
        let mut entry = entry?;
        count += 1;
        require(count <= 1_000_000, "Backup has too many entries")?;
        let kind = entry.header().entry_type();
        require(
            kind.is_file() || kind.is_dir(),
            "Backup contains a link or special file",
        )?;
        let name = entry.path()?.to_string_lossy().to_string();
        require(
            !Path::new(&name).is_absolute(),
            "Backup contains an absolute path",
        )?;
        let target = relative(&name)?;
        if kind.is_dir() {
            create_parents(files, &target)?;
            continue;
        }
        total = total
            .checked_add(entry.size())
            .ok_or_else(|| Error::bad("Backup size overflow"))?;
        require(total <= limit, "Backup exceeds server disk budget")?;
        if let Some(parent) = target.parent() {
            create_parents(files, parent)?;
        }
        let mut output = files.dir.open_with(
            &target,
            cap_std::fs::OpenOptions::new().write(true).create_new(true),
        )?;
        std::io::copy(&mut entry.by_ref().take(limit + 1), &mut output)?;
        files.own_file(&output)?;
    }
    Ok(())
}

fn create_parents(files: &Files, path: &Path) -> Result<()> {
    let mut current = std::path::PathBuf::new();
    for part in path.components() {
        current.push(part);
        if !files.dir.try_exists(&current)? {
            files.dir.create_dir(&current)?;
            files.own_dir(&files.dir.open_dir(&current)?)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn archive_roundtrip_and_budget() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&dest).unwrap();
        fs::write(source.join("server.properties"), b"motd=hello").unwrap();
        fs::create_dir_all(source.join("world/region")).unwrap();
        fs::write(source.join("world/region/chunk.dat"), b"saved chunk").unwrap();
        let archive = temp.path().join("backup.tar.gz");
        #[cfg(unix)]
        let (uid, gid) = {
            use std::os::unix::fs::MetadataExt;
            let metadata = fs::metadata(&source).unwrap();
            (metadata.uid(), metadata.gid())
        };
        #[cfg(not(unix))]
        let (uid, gid) = (1000, 1000);
        pack(&Files::open(&source, uid, gid).unwrap(), &archive).unwrap();
        let files = Files::open(&dest, uid, gid).unwrap();
        assert!(unpack(&archive, &files, 3).is_err());
        unpack(&archive, &files, 1024).unwrap();
        assert_eq!(
            fs::read(dest.join("server.properties")).unwrap(),
            b"motd=hello"
        );
        assert_eq!(
            fs::read(dest.join("world/region/chunk.dat")).unwrap(),
            b"saved chunk"
        );
        files.mkdir("plugins").unwrap();
        files
            .write("plugins/config.yml", b"enabled: true", None)
            .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let directory = fs::metadata(dest.join("world/region")).unwrap();
            assert_eq!((directory.uid(), directory.gid()), (uid, gid));
        }
    }
}
