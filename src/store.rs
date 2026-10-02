use crate::error::{Error, Result};
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::{path::Path, sync::Arc};

#[derive(Clone)]
pub struct Store(Arc<Mutex<Connection>>);

impl Store {
    pub fn open(directory: &Path) -> Result<Self> {
        std::fs::create_dir_all(directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))?;
        }
        let connection = Connection::open(directory.join("emberdeck.db"))?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS objects (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,id));
            CREATE INDEX IF NOT EXISTS objects_updated ON objects(kind,updated_at DESC);
            CREATE TABLE IF NOT EXISTS metrics (server_id TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(server_id,at));")?;
        Ok(Self(Arc::new(Mutex::new(connection))))
    }

    pub fn put<T: Serialize>(&self, kind: &str, id: &str, value: &T) -> Result<()> {
        self.0.lock().execute("INSERT INTO objects VALUES (?1,?2,?3,?4) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
            params![kind,id,serde_json::to_string(value)?,now()])?;
        Ok(())
    }

    pub fn get<T: DeserializeOwned>(&self, kind: &str, id: &str) -> Result<Option<T>> {
        let data: Option<String> = self
            .0
            .lock()
            .query_row(
                "SELECT data FROM objects WHERE kind=?1 AND id=?2",
                params![kind, id],
                |r| r.get(0),
            )
            .optional()?;
        data.map(|json| serde_json::from_str(&json).map_err(Error::from))
            .transpose()
    }

    pub fn need<T: DeserializeOwned>(&self, kind: &str, id: &str) -> Result<T> {
        self.get(kind, id)?
            .ok_or_else(|| Error::not_found(format!("{kind} not found")))
    }

    pub fn list<T: DeserializeOwned>(&self, kind: &str) -> Result<Vec<T>> {
        let db = self.0.lock();
        let mut statement =
            db.prepare("SELECT data FROM objects WHERE kind=?1 ORDER BY updated_at DESC, id")?;
        let rows = statement.query_map([kind], |r| r.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    pub fn update<T: Serialize + DeserializeOwned>(
        &self,
        kind: &str,
        id: &str,
        change: impl FnOnce(&mut T),
    ) -> Result<()> {
        let db = self.0.lock();
        let json: String = db.query_row(
            "SELECT data FROM objects WHERE kind=?1 AND id=?2",
            params![kind, id],
            |r| r.get(0),
        )?;
        let mut value: T = serde_json::from_str(&json)?;
        change(&mut value);
        db.execute(
            "UPDATE objects SET data=?3, updated_at=?4 WHERE kind=?1 AND id=?2",
            params![kind, id, serde_json::to_string(&value)?, now()],
        )?;
        Ok(())
    }

    pub fn delete(&self, kind: &str, id: &str) -> Result<()> {
        self.0.lock().execute(
            "DELETE FROM objects WHERE kind=?1 AND id=?2",
            params![kind, id],
        )?;
        Ok(())
    }

    pub fn audit(
        &self,
        actor: &str,
        action: &str,
        server_id: Option<&str>,
        detail: &str,
    ) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        self.put("activity", &id, &serde_json::json!({"id": id, "at": now(), "actor":actor, "action":action, "server_id":server_id, "detail":detail}))?;
        self.0.lock().execute("DELETE FROM objects WHERE kind='activity' AND id NOT IN (SELECT id FROM objects WHERE kind='activity' ORDER BY updated_at DESC LIMIT 2000)", [])?;
        Ok(())
    }

    pub fn metric(&self, server_id: &str, value: &Value) -> Result<()> {
        let db = self.0.lock();
        db.execute(
            "INSERT OR REPLACE INTO metrics VALUES (?1,?2,?3)",
            params![server_id, now(), serde_json::to_string(value)?],
        )?;
        db.execute("DELETE FROM metrics WHERE at < ?1", [now() - 86_400])?;
        Ok(())
    }

    pub fn history(&self, server_id: &str) -> Result<Vec<Value>> {
        let db = self.0.lock();
        let mut statement = db.prepare("SELECT data FROM (SELECT at,data FROM metrics WHERE server_id=?1 ORDER BY at DESC LIMIT 360) ORDER BY at")?;
        statement
            .query_map([server_id], |r| r.get::<_, String>(0))?
            .map(|r| Ok(serde_json::from_str(&r?)?))
            .collect()
    }
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
