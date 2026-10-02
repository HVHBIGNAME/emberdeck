use crate::{
    agent::{PowerSignal, ServerAction},
    auth,
    error::{Error, Result, require},
    models::{Server, Snapshot},
    panel::Panel,
    store::now,
};
use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::str::FromStr;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScheduledAction {
    Command { command: String },
    Power { signal: PowerSignal },
    Backup { destination: String },
}
impl ScheduledAction {
    pub fn permission(&self) -> &str {
        match self {
            Self::Command { .. } => "console.write",
            Self::Power { .. } => "server.power",
            Self::Backup { .. } => "backups.write",
        }
    }
    fn action(&self, player: Option<&str>) -> ServerAction {
        match self {
            Self::Command { command } => ServerAction::Command {
                command: command.replace("{player}", player.unwrap_or("")),
            },
            Self::Power { signal } => ServerAction::Power { signal: *signal },
            Self::Backup { destination } => ServerAction::Backup {
                destination: destination.clone(),
            },
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskInput {
    pub name: String,
    pub trigger: String,
    #[serde(default)]
    pub cron: String,
    #[serde(default = "utc")]
    pub timezone: String,
    #[serde(default = "interval")]
    pub interval_seconds: u64,
    #[serde(default)]
    pub player_name: Option<String>,
    #[serde(default)]
    pub only_when_empty: bool,
    #[serde(default = "enabled")]
    pub enabled: bool,
    pub operation: ScheduledAction,
}
fn utc() -> String {
    "UTC".into()
}
fn interval() -> u64 {
    3600
}
fn enabled() -> bool {
    true
}
fn player_valid(player: &str) -> bool {
    !player.is_empty()
        && player.len() <= 16
        && player
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

impl TaskInput {
    pub fn validate(&self) -> Result<()> {
        require(
            !self.name.trim().is_empty() && self.name.len() <= 80,
            "Automation name must contain 1–80 characters",
        )?;
        require(
            ["cron", "interval", "player_join", "player_leave", "empty"]
                .contains(&self.trigger.as_str()),
            "Unknown automation trigger",
        )?;
        require(
            (30..=31_536_000).contains(&self.interval_seconds),
            "Interval must be between 30 seconds and 1 year",
        )?;
        if let Some(player) = &self.player_name {
            require(player_valid(player), "Invalid Minecraft player name")?;
        }
        if let ScheduledAction::Command { command } = &self.operation {
            require(
                !command.trim().is_empty()
                    && command.len() <= 2000
                    && !command.contains(['\n', '\r', '\0']),
                "Invalid console command",
            )?;
        }
        if self.trigger == "cron" {
            self.next(now())?;
        }
        Ok(())
    }
    pub fn next(&self, after: i64) -> Result<Option<i64>> {
        if self.trigger == "interval" {
            return Ok(Some(after + self.interval_seconds as i64));
        }
        if self.trigger != "cron" {
            return Ok(None);
        }
        require(
            self.cron.split_whitespace().count() == 5,
            "Use a five-field cron expression: minute hour day month weekday",
        )?;
        let cron = cron::Schedule::from_str(&format!("0 {}", self.cron))
            .map_err(|e| Error::bad(format!("Invalid cron expression: {e}")))?;
        let timezone = chrono_tz::Tz::from_str(&self.timezone)
            .map_err(|_| Error::bad("Use an IANA timezone, such as Europe/Berlin"))?;
        let date = Utc
            .timestamp_opt(after, 0)
            .single()
            .ok_or_else(|| Error::bad("Invalid task timestamp"))?
            .with_timezone(&timezone);
        Ok(Some(
            cron.after(&date)
                .next()
                .ok_or_else(|| Error::bad("Cron expression has no future occurrence"))?
                .timestamp(),
        ))
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub server_id: String,
    pub input: TaskInput,
    pub owner_hash: String,
    pub next_run: Option<i64>,
    pub last_run: Option<i64>,
    pub last_result: Option<String>,
    pub created_at: i64,
}
impl Task {
    pub fn new(server_id: String, input: TaskInput, owner_hash: &str) -> Result<Self> {
        let next_run = input.next(now())?;
        Ok(Self {
            id: uuid::Uuid::new_v4().to_string(),
            server_id,
            input,
            owner_hash: owner_hash.into(),
            next_run,
            last_run: None,
            last_result: None,
            created_at: now(),
        })
    }
    pub fn public(&self) -> Value {
        json!({"id":self.id,"server_id":self.server_id,"input":self.input,"next_run":self.next_run,"last_run":self.last_run,"last_result":self.last_result,"created_at":self.created_at})
    }
}

pub fn events(
    input: &TaskInput,
    previous: Option<&Snapshot>,
    current: &Snapshot,
    at: i64,
    next: Option<i64>,
) -> Vec<Option<String>> {
    if !input.enabled || current.at < at - 30 {
        return Vec::new();
    }
    if input.only_when_empty && current.players.as_ref().is_none_or(|p| p.online != 0) {
        return Vec::new();
    }
    if matches!(input.trigger.as_str(), "cron" | "interval") {
        return if next.is_some_and(|time| time <= at) {
            vec![None]
        } else {
            vec![]
        };
    }
    let Some(previous) = previous.and_then(|p| p.players.as_ref()) else {
        return Vec::new();
    };
    let Some(current) = current.players.as_ref() else {
        return Vec::new();
    };
    if input.trigger == "empty" {
        return if previous.online > 0 && current.online == 0 {
            vec![None]
        } else {
            vec![]
        };
    }
    let (before, after) = if input.trigger == "player_join" {
        (&previous.names, &current.names)
    } else {
        (&current.names, &previous.names)
    };
    after
        .iter()
        .filter(|name| {
            !before.contains(name)
                && player_valid(name)
                && input
                    .player_name
                    .as_ref()
                    .is_none_or(|expected| expected.eq_ignore_ascii_case(name))
        })
        .cloned()
        .map(Some)
        .collect()
}

pub async fn tick(
    panel: &Panel,
    server: &Server,
    previous: Option<&Snapshot>,
    current: &Snapshot,
) -> Result<()> {
    for mut task in panel
        .store
        .list::<Task>("task")?
        .into_iter()
        .filter(|t| t.server_id == server.id && t.input.enabled)
    {
        let occurrences = events(&task.input, previous, current, now(), task.next_run);
        if matches!(task.input.trigger.as_str(), "cron" | "interval")
            && task.next_run.is_some_and(|at| at <= now())
        {
            task.next_run = task.input.next(now())?;
            panel.store.put("task", &task.id, &task)?;
        }
        for player in occurrences {
            let principal = match auth::from_hash(&panel.store, &panel.config, &task.owner_hash) {
                Ok(principal) => principal,
                Err(_) => {
                    task.input.enabled = false;
                    task.last_result = Some("Owner token expired or was revoked".into());
                    panel.store.put("task", &task.id, &task)?;
                    break;
                }
            };
            task.last_run = Some(now());
            panel.store.put("task", &task.id, &task)?;
            let result = panel
                .perform(
                    server,
                    task.input.operation.action(player.as_deref()),
                    &principal,
                )
                .await;
            task.last_result = Some(match result {
                Ok(_) => "Completed".into(),
                Err(error) => format!("Failed: {error}"),
            });
            panel.store.put("task", &task.id, &task)?;
            panel.store.audit(
                "automation",
                &task.input.name,
                Some(&server.id),
                task.last_result.as_deref().unwrap_or(""),
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Players;
    fn task() -> TaskInput {
        TaskInput {
            name: "Welcome".into(),
            trigger: "player_join".into(),
            cron: String::new(),
            timezone: "UTC".into(),
            interval_seconds: 3600,
            player_name: Some("Alex".into()),
            only_when_empty: false,
            enabled: true,
            operation: ScheduledAction::Command {
                command: "say Welcome {player}".into(),
            },
        }
    }
    #[test]
    fn triggers_only_new_matching_players() {
        let mut before = Snapshot::offline("");
        before.at = 100;
        before.players = Some(Players {
            online: 1,
            max: 20,
            names: vec!["Steve".into()],
        });
        let mut after = before.clone();
        after.players = Some(Players {
            online: 3,
            max: 20,
            names: vec!["Steve".into(), "Alex".into(), "Other".into()],
        });
        assert_eq!(
            events(&task(), Some(&before), &after, 100, None),
            vec![Some("Alex".into())]
        );
        assert!(events(&task(), None, &after, 100, None).is_empty());
        assert!(events(&task(), Some(&before), &after, 200, None).is_empty());
    }
    #[test]
    fn unknown_player_count_is_not_empty() {
        let mut input = task();
        input.trigger = "interval".into();
        input.only_when_empty = true;
        let mut snapshot = Snapshot::offline("");
        snapshot.at = 100;
        assert!(events(&input, None, &snapshot, 100, Some(99)).is_empty());
    }
    #[test]
    fn cron_respects_timezone_and_future_only() {
        let mut input = task();
        input.trigger = "cron".into();
        input.cron = "0 3 * * *".into();
        input.timezone = "Europe/Berlin".into();
        let timestamp = Utc
            .with_ymd_and_hms(2026, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        assert_eq!(input.next(timestamp).unwrap(), Some(timestamp + 7200));
    }
}
