use crate::{
    agent::Agent,
    error::{Result, require},
    files::{Files, copy_tree, file_hash},
    jobs::Job,
    models::Server,
    security::{Addon, scan_jar},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
    path::Path,
    time::Duration,
};

#[derive(Clone, Serialize, Deserialize)]
pub struct DiagnoseInput {
    #[serde(default)]
    pub error_text: String,
    #[serde(default = "timeout_default")]
    pub timeout_secs: u64,
    #[serde(default = "trials_default")]
    pub max_trials: usize,
    #[serde(default)]
    pub apply_fix: bool,
}
fn timeout_default() -> u64 {
    120
}
fn trials_default() -> usize {
    16
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Healthy,
    Failed,
    Inconclusive,
}

pub async fn minimize<F, Fut>(mut candidates: Vec<usize>, mut test: F) -> Result<Vec<usize>>
where
    F: FnMut(Vec<usize>) -> Fut,
    Fut: Future<Output = Result<Verdict>>,
{
    let mut granularity = 2;
    while candidates.len() >= 2 {
        let chunk_size = candidates.len().div_ceil(granularity);
        let chunks = candidates
            .chunks(chunk_size)
            .map(|c| c.to_vec())
            .collect::<Vec<_>>();
        let mut reduced = false;
        for chunk in &chunks {
            if test(chunk.clone()).await? == Verdict::Failed {
                candidates = chunk.clone();
                granularity = 2;
                reduced = true;
                break;
            }
        }
        if reduced {
            continue;
        }
        for chunk in &chunks {
            let complement = candidates
                .iter()
                .filter(|c| !chunk.contains(c))
                .copied()
                .collect::<Vec<_>>();
            if !complement.is_empty() && test(complement.clone()).await? == Verdict::Failed {
                candidates = complement;
                granularity = granularity.saturating_sub(1).max(2);
                reduced = true;
                break;
            }
        }
        if !reduced {
            if granularity >= candidates.len() {
                break;
            }
            granularity = (granularity * 2).min(candidates.len());
        }
    }
    Ok(candidates)
}

pub fn dependency_groups(addons: &[(String, Addon)]) -> Vec<Vec<String>> {
    let lookup: BTreeMap<_, _> = addons
        .iter()
        .enumerate()
        .map(|(i, (_, addon))| (addon.id.to_lowercase(), i))
        .collect();
    let mut components = vec![BTreeSet::new(); addons.len()];
    for (i, (_, addon)) in addons.iter().enumerate() {
        components[i].insert(i);
        for dependency in &addon.dependencies {
            if let Some(&target) = lookup.get(&dependency.to_lowercase()) {
                components[i].insert(target);
                components[target].insert(i);
            }
        }
    }
    let mut visited = BTreeSet::new();
    let mut result = Vec::new();
    for start in 0..addons.len() {
        if visited.contains(&start) {
            continue;
        }
        let mut pending = vec![start];
        let mut group = Vec::new();
        while let Some(index) = pending.pop() {
            if visited.insert(index) {
                group.push(addons[index].0.clone());
                pending.extend(components[index].iter().copied());
            }
        }
        result.push(group);
    }
    result
}

#[derive(Clone)]
struct TrialRunner {
    agent: Agent,
    server: Server,
    job: Job,
    input: DiagnoseInput,
    baseline: std::path::PathBuf,
    trial: std::path::PathBuf,
    groups: Vec<Vec<String>>,
    count: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}

impl TrialRunner {
    async fn test(&self, selected: Vec<usize>) -> Result<Verdict> {
        self.agent.jobs.check_cancelled(&self.job.id)?;
        let count = self.count.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        require(
            count <= self.input.max_trials,
            "Trial budget exhausted. No changes were applied to the original server.",
        )?;
        self.agent.jobs.progress(
            &self.job.id,
            &format!(
                "Trial {count}/{} · {} dependency groups enabled",
                self.input.max_trials,
                selected.len()
            ),
        )?;
        self.agent.docker.remove(&self.server).await?;
        if self.trial.exists() {
            std::fs::remove_dir_all(&self.trial)?;
        }
        std::fs::create_dir(&self.trial)?;
        let source = Files::open(
            &self.baseline,
            self.agent.config.container_uid,
            self.agent.config.container_gid,
        )?;
        let target = Files::open(
            &self.trial,
            self.agent.config.container_uid,
            self.agent.config.container_gid,
        )?;
        target.own_dir(&target.dir)?;
        let clone = target.clone();
        tokio::task::spawn_blocking(move || copy_tree(&source.dir, &clone, Path::new(""), 0))
            .await
            .map_err(anyhow::Error::from)??;
        for (index, group) in self.groups.iter().enumerate() {
            if !selected.contains(&index) {
                for path in group {
                    target.rename(path, &format!("{path}.disabled"))?;
                }
            }
        }
        self.agent
            .docker
            .start(
                &self.server,
                &self.trial,
                &crate::auth::new_secret(),
                &self.agent.config,
                false,
            )
            .await?;
        let start = tokio::time::Instant::now();
        let mut ready_at = None;
        while start.elapsed() < Duration::from_secs(self.input.timeout_secs) {
            self.agent.jobs.check_cancelled(&self.job.id)?;
            tokio::time::sleep(Duration::from_secs(3)).await;
            let log = self.agent.docker.logs(&self.server, 1500).await?;
            let dependency_error = [
                "UnknownDependencyException",
                "Missing mandatory dependencies",
                "Incompatible mods found!",
            ]
            .iter()
            .any(|s| log.contains(s));
            if dependency_error {
                return Ok(Verdict::Inconclusive);
            }
            if !self.input.error_text.is_empty() && log.contains(&self.input.error_text) {
                return Ok(Verdict::Failed);
            }
            if log.contains("Done (") && ready_at.is_none() {
                ready_at = Some(tokio::time::Instant::now());
            }
            if ready_at.is_some_and(|time| time.elapsed() > Duration::from_secs(8)) {
                return Ok(Verdict::Healthy);
            }
            if self
                .agent
                .docker
                .inspect(&self.server)
                .await?
                .is_none_or(|v| v["State"]["Running"] != true)
            {
                return Ok(if self.input.error_text.is_empty() {
                    Verdict::Failed
                } else {
                    Verdict::Inconclusive
                });
            }
        }
        Ok(Verdict::Inconclusive)
    }
}

pub async fn run(agent: Agent, server: Server, job: Job, input: DiagnoseInput) -> Result<Value> {
    require(
        (30..=600).contains(&input.timeout_secs) && (4..=64).contains(&input.max_trials),
        "Use 30–600 seconds per trial and 4–64 trials",
    )?;
    require(
        input.error_text.len() <= 500,
        "Error signature must be under 500 characters",
    )?;
    agent.require_stopped(&server).await?;
    let root = agent.config.data_dir.join("diagnostics").join(&job.id);
    std::fs::create_dir_all(root.join("baseline"))?;
    let original = agent.files(&server)?;
    let source = original.clone();
    let baseline = Files::open(
        &root.join("baseline"),
        agent.config.container_uid,
        agent.config.container_gid,
    )?;
    baseline.own_dir(&baseline.dir)?;
    agent.jobs.progress(
        &job.id,
        "Cloning the stopped server into an isolated workspace",
    )?;
    tokio::task::spawn_blocking(move || copy_tree(&source.dir, &baseline, Path::new(""), 0))
        .await
        .map_err(anyhow::Error::from)??;
    let mut addons = Vec::new();
    let mut hashes = BTreeMap::new();
    for directory in ["plugins", "mods"] {
        if !original.dir.try_exists(directory)? {
            continue;
        }
        for file in original
            .list(directory)?
            .into_iter()
            .filter(|entry| !entry.is_dir && entry.name.ends_with(".jar"))
        {
            let hash = file_hash(&original.dir.open(&file.path)?)?;
            let report = scan_jar(original.dir.open(&file.path)?, &file.path, &hash)?;
            hashes.insert(file.path.clone(), hash);
            addons.push((file.path, report.addon));
        }
    }
    require(
        !addons.is_empty(),
        "There are no enabled plugins or mods to isolate",
    )?;
    let groups = dependency_groups(&addons);
    let mut trial_server = server.clone();
    trial_server.id = format!("trial-{}", job.id);
    trial_server.config.modpack = None;
    trial_server
        .config
        .environment
        .insert("ONLINE_MODE".into(), "false".into());
    let runner = TrialRunner {
        agent: agent.clone(),
        server: trial_server,
        job: job.clone(),
        input: input.clone(),
        baseline: root.join("baseline"),
        trial: root.join("trial"),
        groups,
        count: Default::default(),
    };
    let result = isolate(&runner, &server, &original, &hashes).await;
    let cleanup = agent.docker.remove(&runner.server).await;
    if let Err(error) = std::fs::remove_dir_all(&root) {
        tracing::warn!(%error,"Could not remove diagnostic workspace");
    }
    cleanup?;
    result
}

async fn isolate(
    runner: &TrialRunner,
    server: &Server,
    original: &Files,
    hashes: &BTreeMap<String, String>,
) -> Result<Value> {
    let all = (0..runner.groups.len()).collect::<Vec<_>>();
    require(
        runner.test(all.clone()).await? == Verdict::Failed,
        "The original failure did not reproduce in the clone; no changes applied",
    )?;
    require(
        runner.test(Vec::new()).await? == Verdict::Healthy,
        "The server also fails without add-ons, or boot is inconclusive. Inspect the core, configuration and Java runtime.",
    )?;
    let minimal = minimize(all.clone(), |set| {
        let runner = runner.clone();
        async move { runner.test(set).await }
    })
    .await?;
    let remaining = all.into_iter().filter(|i| !minimal.contains(i)).collect();
    let complement_healthy = runner.test(remaining).await? == Verdict::Healthy;
    let suspects = minimal
        .into_iter()
        .flat_map(|i| runner.groups[i].clone())
        .collect::<Vec<_>>();
    let mut applied = false;
    let mut backup = None;
    if runner.input.apply_fix && complement_healthy {
        runner.agent.require_stopped(server).await?;
        for path in &suspects {
            require(
                Some(&file_hash(&original.dir.open(path)?)?) == hashes.get(path),
                "An add-on changed during diagnosis; refusing to apply a stale result",
            )?;
        }
        backup = Some(
            crate::backups::create(&runner.agent, server, "local")
                .await?
                .id,
        );
        let mut renamed = Vec::new();
        for path in &suspects {
            if let Err(error) = original.rename(path, &format!("{path}.disabled")) {
                for previous in renamed {
                    original.rename(&format!("{previous}.disabled"), previous)?;
                }
                return Err(error);
            }
            renamed.push(path.as_str());
        }
        applied = true;
    }
    Ok(
        json!({"suspects":suspects,"complement_healthy":complement_healthy,"applied":applied,"backup_id":backup,"trials":runner.count.load(std::sync::atomic::Ordering::SeqCst),"note":"Minimal failing dependency group for this startup signature. Runtime-only errors require a separate reproduction."}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn finds_interacting_pair_not_only_single_plugins() {
        let result = minimize(vec![0, 1, 2, 3, 4, 5], |set| async move {
            Ok(if set.contains(&2) && set.contains(&4) {
                Verdict::Failed
            } else {
                Verdict::Healthy
            })
        })
        .await
        .unwrap();
        assert_eq!(result, vec![2, 4]);
    }
    #[test]
    fn keeps_hard_dependencies_together() {
        let groups = dependency_groups(&[
            (
                "shop.jar".into(),
                Addon {
                    id: "Shop".into(),
                    dependencies: vec!["Vault".into()],
                },
            ),
            (
                "vault.jar".into(),
                Addon {
                    id: "Vault".into(),
                    dependencies: vec![],
                },
            ),
            (
                "map.jar".into(),
                Addon {
                    id: "Map".into(),
                    dependencies: vec![],
                },
            ),
        ]);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].len(), 2);
    }
}
