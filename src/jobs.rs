use crate::{
    error::{Error, Result},
    store::{Store, now},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{future::Future, sync::Arc};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub server_id: String,
    pub kind: String,
    pub state: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub progress: String,
    pub log: Vec<String>,
    pub result: Option<Value>,
    pub error: Option<String>,
    pub cancel_requested: bool,
}

#[derive(Clone)]
pub struct Jobs {
    pub store: Store,
    locks: Arc<DashMap<String, Arc<Semaphore>>>,
}

impl Jobs {
    pub fn new(store: Store) -> Result<Self> {
        for mut job in store.list::<Job>("job")? {
            if job.state == "running" {
                job.state = "interrupted".into();
                job.error = Some("The agent restarted before this job finished. Inspect the server before retrying.".into());
                store.put("job", &job.id, &job)?;
            }
        }
        Ok(Self {
            store,
            locks: Arc::new(DashMap::new()),
        })
    }

    pub fn lock(&self, server_id: &str) -> Result<OwnedSemaphorePermit> {
        self.locks
            .entry(server_id.into())
            .or_insert_with(|| Arc::new(Semaphore::new(1)))
            .clone()
            .try_acquire_owned()
            .map_err(|_| Error::Conflict("A server operation is already running".into()))
    }

    pub fn start<F, Fut>(&self, server_id: &str, kind: &str, operation: F) -> Result<Job>
    where
        F: FnOnce(Job) -> Fut + Send + 'static,
        Fut: Future<Output = Result<Value>> + Send + 'static,
    {
        let permit = self.lock(server_id)?;
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            server_id: server_id.into(),
            kind: kind.into(),
            state: "running".into(),
            created_at: now(),
            updated_at: now(),
            progress: "Queued".into(),
            log: Vec::new(),
            result: None,
            error: None,
            cancel_requested: false,
        };
        self.store.put("job", &job.id, &job)?;
        let state = self.clone();
        let running = job.clone();
        tokio::spawn(async move {
            let result = operation(running.clone()).await;
            let update = state.store.update::<Job>("job", &running.id, |job| {
                job.updated_at = now();
                match result {
                    Ok(value) => {
                        job.state = "completed".into();
                        job.progress = "Complete".into();
                        job.result = Some(value);
                    }
                    Err(error) => {
                        job.state = if job.cancel_requested {
                            "cancelled"
                        } else {
                            "failed"
                        }
                        .into();
                        job.error = Some(error.to_string());
                    }
                }
            });
            if let Err(error) = update {
                tracing::error!(%error,job_id=%running.id,"Could not persist job result");
            }
            drop(permit);
        });
        Ok(job)
    }

    pub fn progress(&self, id: &str, message: &str) -> Result<()> {
        self.store.update::<Job>("job", id, |job| {
            job.updated_at = now();
            job.progress = message.into();
            job.log.push(message.into());
            if job.log.len() > 200 {
                job.log.remove(0);
            }
        })
    }

    pub fn check_cancelled(&self, id: &str) -> Result<()> {
        if self.store.need::<Job>("job", id)?.cancel_requested {
            Err(Error::Conflict("Job cancelled".into()))
        } else {
            Ok(())
        }
    }
}
