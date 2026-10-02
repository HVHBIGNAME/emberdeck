import { useState } from "react";
import {
  Archive,
  CalendarClock,
  Clock3,
  Cloud,
  Download,
  HardDrive,
  Info,
  Plus,
  RotateCcw,
  Server,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { api, demo, post, useApi } from "./api";
import { useWorkspace } from "./context";
import type { Backup, GameServer, Task, TaskInput } from "./types";
import { Button, Empty, ErrorBox, Loading, Modal, bytes, date } from "./ui";

export function ServerSelect({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (id: string) => void;
}) {
  const { servers } = useWorkspace();
  return (
    <label className="select-server">
      <Server size={15} />
      <select
        aria-label="Select server"
        value={selected}
        onChange={(event) => onChange(event.target.value)}
      >
        {servers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BackupsPage({ server: fixedServer }: { server?: GameServer }) {
  const { servers, revision, runAction, can, notify } = useWorkspace();
  const [id, setId] = useState(fixedServer?.id || servers[0]?.id || "");
  const server = fixedServer || servers.find((s) => s.id === id) || servers[0];
  const backups = useApi<{ backups: Backup[]; destinations: string[] }>(
    server ? `/api/servers/${server.id}/backups` : null,
    6000,
    revision,
  );
  const [destination, setDestination] = useState("local");
  const [restore, setRestore] = useState<Backup | null>(null);
  if (!server)
    return (
      <Empty
        icon={<Archive />}
        title="Something worth keeping"
        description="Create a server to start protecting your worlds with local or off-site backups."
      />
    );
  return (
    <>
      {!fixedServer && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">KEEP THE GOOD THINGS</span>
            <h1>
              Peace of mind, on disk<span className="orange-text">.</span>
            </h1>
            <p>
              Verified archives. Local or off-site. Ready when you need them.
            </p>
          </div>
          <Archive size={25} className="muted" />
        </div>
      )}
      <div className="toolbar">
        {!fixedServer && <ServerSelect selected={server.id} onChange={setId} />}
        <select
          aria-label="Backup destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          {(backups.data?.destinations || ["local"]).map((d) => (
            <option key={d} value={d}>
              {d === "local" ? "Local storage" : d}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={!can("backups.write", server.id)}
          onClick={() =>
            void runAction(server.id, { action: "backup", destination })
          }
        >
          <Plus size={15} />
          Create backup
        </Button>
      </div>
      <div className="notice">
        <Archive size={17} />
        <span>
          Online backups flush and temporarily pause world saves, then resume
          them. A SHA-256 checksum protects each archive. Restores require a
          stopped server and create a rollback backup.
        </span>
      </div>
      <div style={{ height: 20 }} />
      <ErrorBox error={backups.error} />
      {backups.loading ? (
        <Loading />
      ) : backups.data?.backups.length ? (
        <section className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Archive</th>
                <th>Destination</th>
                <th>Size</th>
                <th>Integrity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.data.backups.map((backup) => (
                <tr key={backup.id}>
                  <td>
                    <span className="file-name">
                      <Archive size={17} />
                      <strong>{backup.name}</strong>
                    </span>
                    <small>{date(backup.created_at)}</small>
                  </td>
                  <td>
                    <span className="file-name">
                      {backup.destination === "local" ? (
                        <HardDrive size={13} />
                      ) : (
                        <Cloud size={13} />
                      )}
                      {backup.destination}
                    </span>
                    <small>{backup.remote_state}</small>
                  </td>
                  <td>{bytes(backup.size)}</td>
                  <td>
                    <span className="tag" title={backup.sha256}>
                      SHA-256 · {backup.sha256.slice(0, 8)}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {demo ? (
                        <button
                          className="icon-button"
                          title="Download backup"
                          aria-label={`Download ${backup.name}`}
                          onClick={() =>
                            notify(
                              "The demo contains sample archives. Downloads are available in your own workspace.",
                            )
                          }
                        >
                          <Download size={15} />
                        </button>
                      ) : (
                        <a
                          className="icon-button"
                          href={`/api/servers/${server.id}/backups/${backup.id}/download`}
                          title="Download archive"
                          aria-label={`Download ${backup.name}`}
                        >
                          <Download size={15} />
                        </a>
                      )}
                      <Button
                        disabled={!can("backups.write", server.id)}
                        onClick={() => setRestore(backup)}
                      >
                        <RotateCcw size={12} />
                        Restore
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <Empty
          icon={<Archive />}
          title="Your next save point"
          description="Create your first backup. Add an rclone remote on the node to send copies to Google Drive, S3, or another supported destination."
        />
      )}
      {restore && (
        <RestoreDialog
          backup={restore}
          server={server}
          onClose={() => setRestore(null)}
        />
      )}
    </>
  );
}

function RestoreDialog({
  backup,
  server,
  onClose,
}: {
  backup: Backup;
  server: GameServer;
  onClose: () => void;
}) {
  const { runAction } = useWorkspace();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const stopped = ["offline", "crashed"].includes(server.snapshot.state);
  return (
    <Modal
      title="Restore this save point?"
      subtitle={backup.name}
      onClose={onClose}
    >
      <div className="form-stack">
        <div className="notice orange">
          <Info size={17} />
          <span>
            The current server files will be replaced. A verified local rollback
            backup will be created first.
          </span>
        </div>
        {!stopped && (
          <ErrorBox error="Stop the server before restoring an archive." />
        )}
        <label>
          Type “{server.name}” to confirm
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={server.name}
          />
        </label>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={!stopped || confirmation !== server.name}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            const result = await runAction(server.id, {
              action: "restore",
              backup_id: backup.id,
              confirm: true,
            });
            setBusy(false);
            if (result) onClose();
          }}
        >
          <RotateCcw size={14} />
          Restore backup
        </Button>
      </div>
    </Modal>
  );
}

export function AutomationsPage({
  server: fixedServer,
}: {
  server?: GameServer;
}) {
  const { servers, revision, refresh, notify, can } = useWorkspace();
  const [id, setId] = useState(fixedServer?.id || servers[0]?.id || "");
  const server = fixedServer || servers.find((s) => s.id === id) || servers[0];
  const tasks = useApi<{ tasks: Task[] }>(
    server ? `/api/servers/${server.id}/tasks` : null,
    10000,
    revision,
  );
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState<Task | null>(null);
  if (!server)
    return (
      <Empty
        icon={<Workflow />}
        title="Let the little things run themselves"
        description="Create a server, then add time-based or player-aware automations."
      />
    );
  return (
    <>
      {!fixedServer && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">SET IT. LET IT HAPPEN.</span>
            <h1>
              A little less on your plate<span className="orange-text">.</span>
            </h1>
            <p>Thoughtful automations that know when to act.</p>
          </div>
          <Workflow size={26} className="muted" />
        </div>
      )}
      <div className="toolbar">
        {!fixedServer && <ServerSelect selected={server.id} onChange={setId} />}
        <span className="tag">
          <Clock3 size={11} />
          &nbsp; Timezone-aware schedules
        </span>
        <Button
          variant="primary"
          disabled={!can("tasks.write", server.id)}
          onClick={() => setOpen(true)}
        >
          <Plus size={15} />
          Create automation
        </Button>
      </div>
      <ErrorBox error={tasks.error} />
      {tasks.loading ? (
        <Loading />
      ) : tasks.data?.tasks.length ? (
        <div className="task-list">
          {tasks.data.tasks.map((task) => (
            <article className="panel task-card" key={task.id}>
              <span className="task-icon">
                {task.input.trigger.includes("player") ? (
                  <Users size={20} />
                ) : task.input.trigger === "empty" ? (
                  <Server size={20} />
                ) : (
                  <CalendarClock size={20} />
                )}
              </span>
              <div className="task-main">
                <h3>{task.input.name}</h3>
                <p>
                  {task.input.trigger === "cron"
                    ? `${task.input.cron} · ${task.input.timezone}`
                    : task.input.trigger === "interval"
                      ? `Every ${task.input.interval_seconds} seconds`
                      : task.input.trigger === "empty"
                        ? "When the last player leaves"
                        : task.input.trigger === "player_join"
                          ? "When a player joins"
                          : "When a player leaves"}
                </p>
                <span className="tag">{task.input.operation.kind}</span>
                {task.input.only_when_empty && (
                  <span className="tag">Only if empty</span>
                )}
                {task.input.player_name && (
                  <span className="tag">Player: {task.input.player_name}</span>
                )}
                <code>
                  {task.input.operation.kind === "command"
                    ? task.input.operation.command
                    : task.input.operation.kind === "backup"
                      ? `→ ${task.input.operation.destination}`
                      : task.input.operation.signal}
                </code>
              </div>
              <div className="task-next">
                {task.next_run ? "NEXT RUN" : "EVENT-DRIVEN"}
                <span>
                  {task.next_run
                    ? date(task.next_run)
                    : "Waiting for a player event"}
                </span>
              </div>
              <button
                className={`switch ${task.input.enabled ? "on" : ""}`}
                role="switch"
                aria-checked={task.input.enabled}
                aria-label={`Enable ${task.input.name}`}
                disabled={!can("tasks.write", server.id)}
                onClick={async () => {
                  try {
                    await post(
                      `/api/servers/${server.id}/tasks/${task.id}`,
                      { ...task.input, enabled: !task.input.enabled },
                      "PUT",
                    );
                    refresh();
                    notify(
                      task.input.enabled
                        ? "Automation paused."
                        : "Automation enabled.",
                    );
                  } catch (error) {
                    notify(String(error), true);
                  }
                }}
              />
              <button
                className="icon-button"
                aria-label={`Delete ${task.input.name}`}
                disabled={!can("tasks.write", server.id)}
                onClick={() => setRemove(task)}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Workflow />}
          title="Make room for more building"
          description="Back up an empty world at 4am, greet players by name, or run a command on a schedule."
          action={
            can("tasks.write", server.id) && (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus size={15} />
                Create automation
              </Button>
            )
          }
        />
      )}
      {open && <TaskDialog server={server} onClose={() => setOpen(false)} />}
      {remove && (
        <Modal
          title={`Delete “${remove.input.name}”?`}
          subtitle="This automation will no longer run."
          onClose={() => setRemove(null)}
        >
          <div className="modal-actions">
            <Button onClick={() => setRemove(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api(`/api/servers/${server.id}/tasks/${remove.id}`, {
                    method: "DELETE",
                  });
                  refresh();
                  setRemove(null);
                } catch (error) {
                  notify(String(error), true);
                }
              }}
            >
              Delete automation
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TaskDialog({
  server,
  onClose,
}: {
  server: GameServer;
  onClose: () => void;
}) {
  const { notify, refresh } = useWorkspace();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("cron");
  const [cron, setCron] = useState("0 4 * * *");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [interval, setInterval] = useState(3600);
  const [player, setPlayer] = useState("");
  const [empty, setEmpty] = useState(false);
  const [action, setAction] = useState("command");
  const [command, setCommand] = useState("say A new day, a new adventure.");
  const [signal, setSignal] = useState("restart");
  const [destination, setDestination] = useState("local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const backups = useApi<{ destinations: string[] }>(
    `/api/servers/${server.id}/backups`,
  );
  return (
    <Modal
      title="Give it a little autopilot."
      subtitle={server.name}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const input: TaskInput = {
            name,
            trigger,
            cron,
            timezone,
            interval_seconds: interval,
            player_name: player || null,
            only_when_empty: empty,
            enabled: true,
            operation:
              action === "backup"
                ? { kind: "backup", destination }
                : action === "power"
                  ? { kind: "power", signal }
                  : { kind: "command", command },
          };
          try {
            await post(`/api/servers/${server.id}/tasks`, input);
            refresh();
            notify("Automation created.");
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error
                : new Error("Could not create automation"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Automation name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="A quiet-world backup"
            required
            maxLength={80}
          />
        </label>
        <label>
          When should it run?
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            <option value="cron">On a schedule (cron)</option>
            <option value="interval">At a regular interval</option>
            <option value="empty">When the last player leaves</option>
            <option value="player_join">When a player joins</option>
            <option value="player_leave">When a player leaves</option>
          </select>
        </label>
        {trigger === "cron" && (
          <div className="form-grid">
            <label>
              Cron expression
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                required
              />
              <small>
                Minute · hour · day · month · weekday
                <br />
                Weekday: 1 = Sunday … 7 = Saturday.
              </small>
            </label>
            <label>
              Timezone
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Berlin"
                required
              />
            </label>
          </div>
        )}
        {trigger === "interval" && (
          <label>
            Interval in seconds
            <input
              type="number"
              min={30}
              max={31536000}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </label>
        )}
        {trigger.startsWith("player") && (
          <label>
            Only this player (optional)
            <input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="Any player"
              pattern="[A-Za-z0-9_]{1,16}"
            />
          </label>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={empty}
            onChange={(e) => setEmpty(e.target.checked)}
          />
          Only run when the server has no players.
        </label>
        <label>
          Then do this
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="command">Run a Minecraft command</option>
            <option value="backup">Create a backup</option>
            <option value="power">Change server power</option>
          </select>
        </label>
        {action === "command" && (
          <label>
            Command
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
            <small>
              Use {"{player}"} for the player who triggered the event.
            </small>
          </label>
        )}
        {action === "backup" && (
          <label>
            Backup destination
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {(backups.data?.destinations || ["local"]).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {action === "power" && (
          <label>
            Power action
            <select value={signal} onChange={(e) => setSignal(e.target.value)}>
              <option value="restart">Restart</option>
              <option value="stop">Stop</option>
              <option value="start">Start</option>
            </select>
          </label>
        )}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            <Workflow size={14} />
            Create automation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
