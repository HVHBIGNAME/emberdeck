use crate::{
    config::Config,
    error::{Error, Result, require},
    store::{Store, now},
};
use axum::http::HeaderMap;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub fn new_secret() -> String {
    let bytes: [u8; 32] = rand::random();
    format!("ed_{}", URL_SAFE_NO_PAD.encode(bytes))
}

pub fn digest(secret: &str) -> String {
    hex::encode(Sha256::digest(secret.as_bytes()))
}

pub fn matches(secret: &str, expected: &str) -> bool {
    bool::from(digest(secret).as_bytes().ct_eq(expected.as_bytes()))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    Operator,
    Viewer,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TokenRecord {
    pub id: String,
    pub name: String,
    pub hash: String,
    pub role: Role,
    pub server_ids: Vec<String>,
    pub permissions: Vec<String>,
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Principal {
    pub id: String,
    pub name: String,
    pub role: Role,
    pub server_ids: Vec<String>,
    pub permissions: Vec<String>,
    #[serde(skip)]
    pub token_hash: String,
}

impl Principal {
    pub fn is_admin(&self) -> bool {
        self.role == Role::Admin
    }
    pub fn can_see(&self, server_id: &str) -> bool {
        self.is_admin()
            || self
                .server_ids
                .iter()
                .any(|id| id == "*" || id == server_id)
    }
    pub fn allow(&self, permission: &str, server_id: Option<&str>) -> Result<()> {
        let visible = server_id.is_none_or(|id| self.can_see(id));
        if visible && (self.is_admin() || self.permissions.iter().any(|p| p == permission)) {
            Ok(())
        } else {
            Err(Error::Forbidden(format!(
                "Permission required: {permission}"
            )))
        }
    }
    pub fn admin(&self) -> Result<()> {
        self.allow("admin", None)
    }
}

#[derive(Serialize, Deserialize)]
pub struct Session {
    pub token_hash: String,
    pub expires_at: i64,
}

pub fn role_permissions(role: &Role) -> Vec<String> {
    let mut permissions = vec![
        "server.read",
        "console.read",
        "files.read",
        "backups.read",
        "packages.read",
        "tasks.read",
        "diagnostics.read",
    ];
    if *role == Role::Operator {
        permissions.extend([
            "server.power",
            "console.write",
            "files.write",
            "backups.write",
            "packages.write",
            "tasks.write",
            "diagnostics.write",
            "assistant.use",
        ]);
    }
    if *role == Role::Admin {
        permissions.push("admin");
    }
    permissions.into_iter().map(String::from).collect()
}

pub fn from_hash(store: &Store, config: &Config, hash: &str) -> Result<Principal> {
    if bool::from(hash.as_bytes().ct_eq(config.master_token_hash.as_bytes())) {
        return Ok(Principal {
            id: "owner".into(),
            name: "Owner".into(),
            role: Role::Admin,
            server_ids: vec!["*".into()],
            permissions: vec!["admin".into()],
            token_hash: hash.into(),
        });
    }
    let record: TokenRecord = store.get("token", hash)?.ok_or(Error::Unauthorized)?;
    if record.expires_at.is_some_and(|expiry| expiry <= now()) {
        return Err(Error::Unauthorized);
    }
    Ok(Principal {
        id: record.id,
        name: record.name,
        role: record.role,
        server_ids: record.server_ids,
        permissions: record.permissions,
        token_hash: hash.into(),
    })
}

pub fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

pub fn cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("cookie")?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| part.trim().strip_prefix("emberdeck_session="))
}

pub fn authenticate(store: &ConfigStore<'_>, headers: &HeaderMap) -> Result<Principal> {
    if let Some(token) = bearer(headers) {
        return from_hash(store.db, store.config, &digest(token));
    }
    let session_token = cookie(headers).ok_or(Error::Unauthorized)?;
    let session: Session = store
        .db
        .get("session", &digest(session_token))?
        .ok_or(Error::Unauthorized)?;
    if session.expires_at <= now() {
        return Err(Error::Unauthorized);
    }
    from_hash(store.db, store.config, &session.token_hash)
}

pub struct ConfigStore<'a> {
    pub db: &'a Store,
    pub config: &'a Config,
}

pub fn check_csrf(headers: &HeaderMap, config: &Config) -> Result<()> {
    if bearer(headers).is_some() {
        return Ok(());
    }
    let origin = headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            Error::Forbidden("Origin header required for cookie-authenticated changes".into())
        })?;
    let actual =
        reqwest::Url::parse(origin).map_err(|_| Error::Forbidden("Invalid origin".into()))?;
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let same_host = reqwest::Url::parse(&format!("{}://{host}", actual.scheme()))
        .is_ok_and(|expected| expected.origin() == actual.origin());
    if origin.trim_end_matches('/') == config.public_url.trim_end_matches('/')
        || (same_host && matches!(actual.scheme(), "http" | "https"))
    {
        Ok(())
    } else {
        Err(Error::Forbidden(
            "Cross-origin changes are not allowed".into(),
        ))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TokenInput {
    pub name: String,
    pub role: Role,
    pub server_ids: Vec<String>,
    #[serde(default)]
    pub permissions: Option<Vec<String>>,
    #[serde(default)]
    pub expires_at: Option<i64>,
}

pub fn issue(store: &Store, input: TokenInput) -> Result<(String, TokenRecord)> {
    require(
        !input.name.trim().is_empty() && input.name.len() <= 80,
        "Token name must contain 1–80 characters",
    )?;
    require(
        input.expires_at.is_none_or(|at| at > now()),
        "Token expiry must be in the future",
    )?;
    require(
        !input.server_ids.is_empty(),
        "Explicitly select servers or use * for all servers",
    )?;
    let defaults = role_permissions(&input.role);
    let permissions = input.permissions.unwrap_or(defaults.clone());
    require(
        input.role == Role::Admin || permissions.iter().all(|p| defaults.contains(p)),
        "Permissions exceed this role",
    )?;
    let secret = new_secret();
    let record = TokenRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name,
        hash: digest(&secret),
        role: input.role,
        server_ids: input.server_ids,
        permissions,
        expires_at: input.expires_at,
        created_at: now(),
    };
    store.put("token", &record.hash, &record)?;
    Ok((secret, record))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_viewer_cannot_mutate_or_cross_servers() {
        let p = Principal {
            id: "a".into(),
            name: "Guest".into(),
            role: Role::Viewer,
            server_ids: vec!["one".into()],
            permissions: role_permissions(&Role::Viewer),
            token_hash: String::new(),
        };
        assert!(p.allow("server.read", Some("one")).is_ok());
        assert!(p.allow("server.power", Some("one")).is_err());
        assert!(p.allow("server.read", Some("two")).is_err());
        assert!(p.admin().is_err());
    }
    #[test]
    fn tokens_are_independent_and_hash_verified() {
        let token = new_secret();
        assert_ne!(token, new_secret());
        assert!(matches(&token, &digest(&token)));
        assert!(!matches("wrong", &digest(&token)));
    }
}
