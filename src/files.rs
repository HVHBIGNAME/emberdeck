use crate::error::{Error, Result, require};
use cap_std::fs::{Dir, OpenOptions};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Arc,
};

pub const WEB_FILE_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Clone)]
pub struct Files {
    pub dir: Arc<Dir>,
    pub uid: u32,
    pub gid: u32,
}

#[derive(Clone, Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

pub fn relative(input: &str) -> Result<PathBuf> {
    require(
        input.len() <= 2048 && !input.contains(['\\', ':', '\0']),
        "Invalid file path",
    )?;
    let path = Path::new(input.trim_start_matches('/'));
    require(
        path.components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir)),
        "Path traversal is not permitted",
    )?;
    Ok(if path.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        path.into()
    })
}

impl Files {
    pub fn open(root: &Path, uid: u32, gid: u32) -> Result<Self> {
        Ok(Self {
            dir: Arc::new(Dir::open_ambient_dir(root, cap_std::ambient_authority())?),
            uid,
            gid,
        })
    }

    pub fn list(&self, input: &str) -> Result<Vec<Entry>> {
        let path = relative(input)?;
        let mut entries = Vec::new();
        for entry in self.dir.read_dir(&path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            if entry.file_type()?.is_symlink() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let modified = metadata
                .modified()
                .ok()
                .and_then(|time| time.into_std().duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs());
            entries.push(Entry {
                path: path.join(&name).to_string_lossy().replace('\\', "/"),
                name,
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified,
            });
            require(entries.len() <= 20_000, "Directory has too many entries")?;
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(entries)
    }

    pub fn read(&self, input: &str, limit: usize) -> Result<Vec<u8>> {
        let mut file = self.dir.open(relative(input)?)?;
        require(file.metadata()?.is_file(), "Only regular files can be read")?;
        require(
            file.metadata()?.len() <= limit as u64,
            "File is too large for the web editor; use SFTP",
        )?;
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)?;
        require(bytes.len() <= limit, "File exceeded the download limit")?;
        Ok(bytes)
    }

    pub fn write(&self, input: &str, bytes: &[u8], expected: Option<&str>) -> Result<()> {
        require(
            bytes.len() <= WEB_FILE_LIMIT,
            "Web uploads are limited to 32 MiB; use SFTP for larger files",
        )?;
        let path = relative(input)?;
        let name = path
            .file_name()
            .ok_or_else(|| Error::bad("A filename is required"))?;
        let parent_path = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let parent = self.dir.open_dir(parent_path)?;
        if let Some(hash) = expected {
            let actual = file_hash(&self.dir.open(&path)?)?;
            if actual != hash {
                return Err(Error::Conflict(
                    "File changed since it was opened. Reload before saving.".into(),
                ));
            }
        }
        let temporary = format!(".emberdeck-{}.tmp", uuid::Uuid::new_v4());
        let write_result = (|| -> Result<()> {
            let mut file =
                parent.open_with(&temporary, OpenOptions::new().write(true).create_new(true))?;
            file.write_all(bytes)?;
            file.sync_all()?;
            self.own_file(&file)?;
            parent.rename(&temporary, &parent, name)?;
            Ok(())
        })();
        if write_result.is_err()
            && let Err(error) = parent.remove_file(&temporary)
        {
            tracing::debug!(%error, "Temporary upload already removed");
        }
        write_result
    }

    pub fn mkdir(&self, input: &str) -> Result<()> {
        let path = relative(input)?;
        self.dir.create_dir(&path)?;
        self.own_dir(&self.dir.open_dir(path)?)
    }

    pub fn remove(&self, input: &str) -> Result<()> {
        let path = relative(input)?;
        require(path != Path::new("."), "Cannot remove the server root")?;
        if self.dir.symlink_metadata(&path)?.is_dir() {
            self.dir.remove_dir(&path)?;
        } else {
            self.dir.remove_file(&path)?;
        }
        Ok(())
    }

    pub fn rename(&self, from: &str, to: &str) -> Result<()> {
        let from = relative(from)?;
        let to = relative(to)?;
        require(
            from != Path::new(".") && to != Path::new("."),
            "Cannot rename the server root",
        )?;
        if self.dir.try_exists(&to)? {
            return Err(Error::Conflict("Destination already exists".into()));
        }
        self.dir.rename(from, &self.dir, to)?;
        Ok(())
    }

    pub fn size(&self) -> Result<u64> {
        tree_size(&self.dir, 0)
    }

    pub fn own_file(&self, file: &cap_std::fs::File) -> Result<()> {
        #[cfg(unix)]
        {
            rustix::fs::fchown(
                file,
                Some(rustix::fs::Uid::from_raw(self.uid)),
                Some(rustix::fs::Gid::from_raw(self.gid)),
            )
            .map_err(std::io::Error::from)?;
        }
        #[cfg(not(unix))]
        {
            let _ = (file, self.uid, self.gid);
        }
        Ok(())
    }

    pub fn own_dir(&self, dir: &Dir) -> Result<()> {
        #[cfg(unix)]
        {
            // Nested capability directories may use O_PATH descriptors on Linux.
            rustix::fs::chownat(
                dir,
                ".",
                Some(rustix::fs::Uid::from_raw(self.uid)),
                Some(rustix::fs::Gid::from_raw(self.gid)),
                rustix::fs::AtFlags::empty(),
            )
            .map_err(std::io::Error::from)?;
        }
        #[cfg(not(unix))]
        {
            let _ = dir;
        }
        Ok(())
    }
}

pub fn file_hash(file: &cap_std::fs::File) -> Result<String> {
    let mut reader = file.try_clone()?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut reader, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

fn tree_size(dir: &Dir, depth: usize) -> Result<u64> {
    require(depth <= 64, "Directory nesting limit exceeded")?;
    let mut total = 0_u64;
    for entry in dir.entries()? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        total = total.saturating_add(if kind.is_dir() {
            tree_size(&entry.open_dir()?, depth + 1)?
        } else if kind.is_file() {
            entry.metadata()?.len()
        } else {
            0
        });
    }
    Ok(total)
}

pub fn copy_tree(source: &Dir, destination: &Files, path: &Path, depth: usize) -> Result<()> {
    require(depth <= 64, "Directory nesting limit exceeded")?;
    for entry in source.entries()? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let name = entry.file_name();
        let target = path.join(&name);
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            destination.dir.create_dir(&target)?;
            destination.own_dir(&destination.dir.open_dir(&target)?)?;
            copy_tree(&entry.open_dir()?, destination, &target, depth + 1)?;
        } else if kind.is_file() {
            let mut output = destination.dir.create(&target)?;
            std::io::copy(&mut entry.open()?, &mut output)?;
            destination.own_file(&output)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_parent_paths_and_windows_alternates() {
        for path in [
            "../secret",
            "/../../etc/passwd",
            "world/../../x",
            "C:\\secret",
            "file:stream",
            "a\0b",
        ] {
            assert!(relative(path).is_err(), "{path}");
        }
        assert_eq!(
            relative("/world/region").unwrap(),
            Path::new("world/region")
        );
    }
    #[test]
    fn compare_and_swap_preserves_concurrent_edit() {
        let root = tempfile::tempdir().unwrap();
        let files = Files::open(root.path(), current_uid(), current_gid()).unwrap();
        files.write("server.properties", b"first", None).unwrap();
        let hash = file_hash(&files.dir.open("server.properties").unwrap()).unwrap();
        files.write("server.properties", b"second", None).unwrap();
        assert!(
            files
                .write("server.properties", b"stale", Some(&hash))
                .is_err()
        );
        assert_eq!(files.read("server.properties", 100).unwrap(), b"second");
    }
    #[cfg(unix)]
    #[test]
    fn capability_root_blocks_symlink_escape() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), b"private").unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
        let files = Files::open(root.path(), current_uid(), current_gid()).unwrap();
        assert!(files.read("escape/secret", 100).is_err());
        assert!(files.write("escape/new", b"no", None).is_err());
    }
    fn current_uid() -> u32 {
        #[cfg(unix)]
        {
            std::os::unix::fs::MetadataExt::uid(&std::fs::metadata(".").unwrap())
        }
        #[cfg(not(unix))]
        {
            1000
        }
    }
    fn current_gid() -> u32 {
        #[cfg(unix)]
        {
            std::os::unix::fs::MetadataExt::gid(&std::fs::metadata(".").unwrap())
        }
        #[cfg(not(unix))]
        {
            1000
        }
    }
}
