use crate::{
    agent::{Agent, SftpCredential},
    auth,
    config::private_write,
    files::{Files, relative},
    store::now,
};
use russh::{
    Channel, ChannelId,
    server::{Auth, ChannelOpenHandle, Msg, Server as _, Session},
};
use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode,
};
use std::{
    collections::HashMap,
    io::{Read, Seek, SeekFrom, Write},
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};

#[derive(Clone)]
struct SshServer {
    agent: Agent,
}

struct SshSession {
    agent: Agent,
    credential: Option<SftpCredential>,
    channels: HashMap<ChannelId, Channel<Msg>>,
}

impl russh::server::Server for SshServer {
    type Handler = SshSession;
    fn new_client(&mut self, _: Option<SocketAddr>) -> Self::Handler {
        SshSession {
            agent: self.agent.clone(),
            credential: None,
            channels: HashMap::new(),
        }
    }
}

impl russh::server::Handler for SshSession {
    type Error = anyhow::Error;

    async fn auth_password(
        &mut self,
        user: &str,
        password: &str,
    ) -> std::result::Result<Auth, Self::Error> {
        let credential = self
            .agent
            .store
            .get::<SftpCredential>("sftp", &auth::digest(password))?;
        if let Some(credential) = credential
            && credential.server_id == user
            && credential.expires_at > now()
            && self.agent.server(user).is_ok()
        {
            self.credential = Some(credential);
            return Ok(Auth::Accept);
        }
        Ok(Auth::reject())
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: ChannelOpenHandle,
        _: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        if self.credential.is_some() && self.channels.len() < 2 {
            self.channels.insert(channel.id(), channel);
            reply.accept().await;
        }
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        id: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        if name != "sftp" {
            session.channel_failure(id)?;
            return Ok(());
        }
        let Some(credential) = self.credential.clone() else {
            session.channel_failure(id)?;
            return Ok(());
        };
        let Some(channel) = self.channels.remove(&id) else {
            session.channel_failure(id)?;
            return Ok(());
        };
        let files = self
            .agent
            .files(&self.agent.server(&credential.server_id)?)?;
        session.channel_success(id)?;
        let transfer = SftpSession {
            agent: self.agent.clone(),
            credential,
            files,
            handles: HashMap::new(),
            directories: HashMap::new(),
        };
        tokio::spawn(async move {
            russh_sftp::server::run(channel.into_stream(), transfer).await;
        });
        Ok(())
    }

    async fn channel_eof(
        &mut self,
        id: ChannelId,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        session.close(id)?;
        Ok(())
    }
}

struct OpenFile {
    file: cap_std::fs::File,
    writable: bool,
    path: String,
    initial_size: u64,
    used_bytes: u64,
    budget: u64,
    _permit: Option<tokio::sync::OwnedSemaphorePermit>,
}

struct SftpSession {
    agent: Agent,
    credential: SftpCredential,
    files: Files,
    handles: HashMap<String, OpenFile>,
    directories: HashMap<String, Vec<File>>,
}

type SftpResult<T> = std::result::Result<T, StatusCode>;

fn io_status(error: std::io::Error) -> StatusCode {
    match error.kind() {
        std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
        std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}
fn app_status(error: crate::error::Error) -> StatusCode {
    match error {
        crate::error::Error::Io(error) => io_status(error),
        crate::error::Error::Forbidden(_)
        | crate::error::Error::Unauthorized
        | crate::error::Error::BadRequest(_) => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}
fn ok(id: u32) -> Status {
    Status {
        id,
        status_code: StatusCode::Ok,
        error_message: "OK".into(),
        language_tag: "en".into(),
    }
}

impl SftpSession {
    fn check(&self, write: bool) -> SftpResult<()> {
        let current = self
            .agent
            .store
            .get::<SftpCredential>("sftp", &self.credential.hash)
            .map_err(app_status)?;
        if current.is_none_or(|c| c.expires_at <= now())
            || (write && self.credential.read_only)
            || self.agent.server(&self.credential.server_id).is_err()
        {
            return Err(StatusCode::PermissionDenied);
        }
        Ok(())
    }
    fn lock(&self) -> SftpResult<tokio::sync::OwnedSemaphorePermit> {
        self.check(true)?;
        self.agent
            .jobs
            .lock(&self.credential.server_id)
            .map_err(app_status)
    }
    fn attributes(&self, path: &str) -> SftpResult<FileAttributes> {
        self.check(false)?;
        let metadata = self
            .files
            .dir
            .metadata(relative(path).map_err(app_status)?)
            .map_err(io_status)?;
        Ok(FileAttributes {
            size: Some(metadata.len()),
            uid: Some(self.files.uid),
            gid: Some(self.files.gid),
            permissions: Some(if metadata.is_dir() { 0o40755 } else { 0o100644 }),
            mtime: metadata
                .modified()
                .ok()
                .and_then(|t| t.into_std().duration_since(std::time::UNIX_EPOCH).ok())
                .map(|t| t.as_secs() as u32),
            ..Default::default()
        })
    }
}

impl russh_sftp::server::Handler for SftpSession {
    type Error = StatusCode;
    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        flags: OpenFlags,
        _: FileAttributes,
    ) -> SftpResult<Handle> {
        let writable = flags.intersects(
            OpenFlags::WRITE | OpenFlags::APPEND | OpenFlags::CREATE | OpenFlags::TRUNCATE,
        );
        self.check(writable)?;
        if self.handles.len() >= 32 {
            return Err(StatusCode::Failure);
        }
        let permit = if writable { Some(self.lock()?) } else { None };
        let path = relative(&filename).map_err(app_status)?;
        let mut options = cap_std::fs::OpenOptions::new();
        options
            .read(flags.contains(OpenFlags::READ))
            .write(flags.contains(OpenFlags::WRITE))
            .append(flags.contains(OpenFlags::APPEND))
            .create(flags.contains(OpenFlags::CREATE))
            .create_new(flags.contains(OpenFlags::CREATE | OpenFlags::EXCLUDE))
            .truncate(flags.contains(OpenFlags::TRUNCATE));
        let file = self
            .files
            .dir
            .open_with(&path, &options)
            .map_err(io_status)?;
        if !file.metadata().map_err(io_status)?.is_file() {
            return Err(StatusCode::PermissionDenied);
        }
        if writable {
            self.files.own_file(&file).map_err(app_status)?;
        }
        let initial_size = file.metadata().map_err(io_status)?.len();
        let used_bytes = if writable {
            self.files.size().map_err(app_status)?
        } else {
            0
        };
        let budget = self
            .agent
            .server(&self.credential.server_id)
            .map_err(app_status)?
            .config
            .disk_mb
            * 1024
            * 1024;
        let handle = uuid::Uuid::new_v4().to_string();
        self.handles.insert(
            handle.clone(),
            OpenFile {
                file,
                writable,
                path: filename,
                initial_size,
                used_bytes,
                budget,
                _permit: permit,
            },
        );
        Ok(Handle { id, handle })
    }

    async fn close(&mut self, id: u32, handle: String) -> SftpResult<Status> {
        if let Some(file) = self.handles.remove(&handle) {
            if file.writable {
                file.file.sync_all().map_err(io_status)?;
                self.agent
                    .store
                    .audit(
                        "sftp",
                        "File written",
                        Some(&self.credential.server_id),
                        &file.path,
                    )
                    .map_err(app_status)?;
            }
        } else if self.directories.remove(&handle).is_none() {
            return Err(StatusCode::NoSuchFile);
        }
        Ok(ok(id))
    }

    async fn read(&mut self, id: u32, handle: String, offset: u64, len: u32) -> SftpResult<Data> {
        self.check(false)?;
        let open = self
            .handles
            .get_mut(&handle)
            .ok_or(StatusCode::NoSuchFile)?;
        open.file.seek(SeekFrom::Start(offset)).map_err(io_status)?;
        let mut data = vec![0; len.min(256 * 1024) as usize];
        let read = open.file.read(&mut data).map_err(io_status)?;
        if read == 0 {
            return Err(StatusCode::Eof);
        }
        data.truncate(read);
        Ok(Data { id, data })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> SftpResult<Status> {
        self.check(true)?;
        let open = self
            .handles
            .get_mut(&handle)
            .ok_or(StatusCode::NoSuchFile)?;
        let end = offset
            .checked_add(data.len() as u64)
            .ok_or(StatusCode::Failure)?;
        if !open.writable
            || data.len() > 256 * 1024
            || open
                .used_bytes
                .saturating_add(end.saturating_sub(open.initial_size))
                > open.budget
        {
            return Err(StatusCode::PermissionDenied);
        }
        open.file.seek(SeekFrom::Start(offset)).map_err(io_status)?;
        open.file.write_all(&data).map_err(io_status)?;
        Ok(ok(id))
    }

    async fn stat(&mut self, id: u32, path: String) -> SftpResult<Attrs> {
        Ok(Attrs {
            id,
            attrs: self.attributes(&path)?,
        })
    }
    async fn lstat(&mut self, id: u32, path: String) -> SftpResult<Attrs> {
        self.stat(id, path).await
    }
    async fn fstat(&mut self, id: u32, handle: String) -> SftpResult<Attrs> {
        self.check(false)?;
        let open = self.handles.get(&handle).ok_or(StatusCode::NoSuchFile)?;
        let metadata = open.file.metadata().map_err(io_status)?;
        Ok(Attrs {
            id,
            attrs: FileAttributes {
                size: Some(metadata.len()),
                permissions: Some(0o100644),
                ..Default::default()
            },
        })
    }

    async fn opendir(&mut self, id: u32, path: String) -> SftpResult<Handle> {
        self.check(false)?;
        if self.directories.len() >= 32 {
            return Err(StatusCode::Failure);
        }
        let entries = self
            .files
            .list(&path)
            .map_err(app_status)?
            .into_iter()
            .map(|entry| {
                File::new(
                    entry.name,
                    FileAttributes {
                        size: Some(entry.size),
                        permissions: Some(if entry.is_dir { 0o40755 } else { 0o100644 }),
                        mtime: Some(entry.modified as u32),
                        ..Default::default()
                    },
                )
            })
            .collect();
        let handle = uuid::Uuid::new_v4().to_string();
        self.directories.insert(handle.clone(), entries);
        Ok(Handle { id, handle })
    }
    async fn readdir(&mut self, id: u32, handle: String) -> SftpResult<Name> {
        self.check(false)?;
        let entries = self
            .directories
            .get_mut(&handle)
            .ok_or(StatusCode::NoSuchFile)?;
        if entries.is_empty() {
            return Err(StatusCode::Eof);
        }
        let length = entries.len().min(100);
        Ok(Name {
            id,
            files: entries.drain(..length).collect(),
        })
    }
    async fn realpath(&mut self, id: u32, path: String) -> SftpResult<Name> {
        self.check(false)?;
        let path = relative(&path).map_err(app_status)?;
        let normalized = if path == std::path::Path::new(".") {
            "/".into()
        } else {
            format!("/{}", path.to_string_lossy().replace('\\', "/"))
        };
        Ok(Name {
            id,
            files: vec![File::dummy(normalized)],
        })
    }
    async fn remove(&mut self, id: u32, path: String) -> SftpResult<Status> {
        let _lock = self.lock()?;
        self.files.remove(&path).map_err(app_status)?;
        Ok(ok(id))
    }
    async fn rmdir(&mut self, id: u32, path: String) -> SftpResult<Status> {
        self.remove(id, path).await
    }
    async fn mkdir(&mut self, id: u32, path: String, _: FileAttributes) -> SftpResult<Status> {
        let _lock = self.lock()?;
        self.files.mkdir(&path).map_err(app_status)?;
        Ok(ok(id))
    }
    async fn rename(&mut self, id: u32, from: String, to: String) -> SftpResult<Status> {
        let _lock = self.lock()?;
        self.files.rename(&from, &to).map_err(app_status)?;
        Ok(ok(id))
    }
}

pub async fn serve(agent: Agent) -> anyhow::Result<()> {
    let path = agent.config.data_dir.join("sftp_host_key");
    let key = if path.exists() {
        russh::keys::PrivateKey::read_openssh_file(&path)?
    } else {
        let key =
            russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)?;
        private_write(
            &path,
            key.to_openssh(russh::keys::ssh_key::LineEnding::LF)?
                .as_bytes(),
        )?;
        key
    };
    let config = russh::server::Config {
        auth_rejection_time: Duration::from_secs(2),
        inactivity_timeout: Some(Duration::from_secs(300)),
        keys: vec![key],
        ..Default::default()
    };
    let listen = agent.config.sftp_listen.clone();
    tracing::info!(%listen,"SFTP listening");
    SshServer { agent }
        .run_on_address(Arc::new(config), listen)
        .await?;
    Ok(())
}
