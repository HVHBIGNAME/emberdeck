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
import {
  AnimatePresence,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  Select,
  bytes,
  date,
} from "./ui";
import { useTranslation } from "./i18n";

export function ServerSelect({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (id: string) => void;
}) {
  const { servers } = useWorkspace();
  const { t } = useTranslation();
  return (
    <div className="select-server">
      <Server size={15} />
      <Select
        label={t("Select server")}
        value={selected}
        onValueChange={onChange}
        options={servers.map((server) => ({
          value: server.id,
          label: server.name,
        }))}
      />
    </div>
  );
}

export function BackupsPage({ server: fixedServer }: { server?: GameServer }) {
  const { t } = useTranslation();
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
            <span className="eyebrow">{t("KEEP THE GOOD THINGS")}</span>
            <h1>
              {t("Peace of mind, on disk")}
              <span className="orange-text">.</span>
            </h1>
            <p>
              {t(
                "Verified archives. Local or off-site. Ready when you need them.",
              )}
            </p>
          </div>
          <Archive size={25} className="muted" />
        </div>
      )}
      <div className="toolbar">
        {!fixedServer && <ServerSelect selected={server.id} onChange={setId} />}
        <Select
          label={t("Backup destination")}
          value={destination}
          onValueChange={setDestination}
          options={(backups.data?.destinations || ["local"]).map((value) => ({
            value,
            label: value === "local" ? t("Local storage") : value,
          }))}
        />
        <Button
          variant="primary"
          disabled={!can("backups.write", server.id)}
          onClick={() =>
            void runAction(server.id, { action: "backup", destination })
          }
        >
          <Plus size={15} />
          {t("Create backup")}
        </Button>
      </div>
      <div className="notice">
        <Archive size={17} />
        <span>
          {t(
            "Online backups flush and temporarily pause world saves, then resume them. A SHA-256 checksum protects each archive. Restores require a stopped server and create a rollback backup.",
          )}
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
                <th>{t("Archive")}</th>
                <th>{t("Destination")}</th>
                <th>{t("Size")}</th>
                <th>{t("Integrity")}</th>
                <th>{t("Actions")}</th>
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
                      {backup.destination === "local"
                        ? t("Local storage")
                        : backup.destination}
                    </span>
                    <small>{t(backup.remote_state)}</small>
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
                          title={t("Download backup")}
                          aria-label={t("Download {{name}}", {
                            name: backup.name,
                          })}
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
                          title={t("Download archive")}
                          aria-label={t("Download {{name}}", {
                            name: backup.name,
                          })}
                        >
                          <Download size={15} />
                        </a>
                      )}
                      <Button
                        disabled={!can("backups.write", server.id)}
                        onClick={() => setRestore(backup)}
                      >
                        <RotateCcw size={12} />
                        {t("Restore")}
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
      <AnimatePresence>
        {restore && (
          <RestoreDialog
            backup={restore}
            server={server}
            onClose={() => setRestore(null)}
          />
        )}
      </AnimatePresence>
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
  const { t } = useTranslation();
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
            {t(
              "The current server files will be replaced. A verified local rollback backup will be created first.",
            )}
          </span>
        </div>
        {!stopped && (
          <ErrorBox error="Stop the server before restoring an archive." />
        )}
        <label>
          {t("Type “{{name}}” to confirm", { name: server.name })}
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={server.name}
          />
        </label>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>{t("Cancel")}</Button>
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
          {t("Restore backup")}
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
  const { t } = useTranslation();
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
            <span className="eyebrow">{t("SET IT. LET IT HAPPEN.")}</span>
            <h1>
              {t("A little less on your plate")}
              <span className="orange-text">.</span>
            </h1>
            <p>{t("Thoughtful automations that know when to act.")}</p>
          </div>
          <Workflow size={26} className="muted" />
        </div>
      )}
      <div className="toolbar">
        {!fixedServer && <ServerSelect selected={server.id} onChange={setId} />}
        <span className="tag">
          <Clock3 size={11} />
          &nbsp; {t("Timezone-aware schedules")}
        </span>
        <Button
          variant="primary"
          disabled={!can("tasks.write", server.id)}
          onClick={() => setOpen(true)}
        >
          <Plus size={15} />
          {t("Create automation")}
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
                      ? t("Every {{count}} seconds", {
                          count: task.input.interval_seconds,
                        })
                      : task.input.trigger === "empty"
                        ? t("When the last player leaves")
                        : task.input.trigger === "player_join"
                          ? t("When a player joins")
                          : t("When a player leaves")}
                </p>
                <span className="tag">{t(task.input.operation.kind)}</span>
                {task.input.only_when_empty && (
                  <span className="tag">{t("Only if empty")}</span>
                )}
                {task.input.player_name && (
                  <span className="tag">
                    {t("Player: {{name}}", { name: task.input.player_name })}
                  </span>
                )}
                <code>
                  {task.input.operation.kind === "command"
                    ? task.input.operation.command
                    : task.input.operation.kind === "backup"
                      ? `→ ${task.input.operation.destination}`
                      : t(task.input.operation.signal)}
                </code>
              </div>
              <div className="task-next">
                {t(task.next_run ? "NEXT RUN" : "EVENT-DRIVEN")}
                <span>
                  {task.next_run
                    ? date(task.next_run)
                    : t("Waiting for a player event")}
                </span>
              </div>
              <button
                className={`switch ${task.input.enabled ? "on" : ""}`}
                role="switch"
                aria-checked={task.input.enabled}
                aria-label={t("Enable {{name}}", { name: task.input.name })}
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
                aria-label={t("Delete {{name}}", { name: task.input.name })}
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
                {t("Create automation")}
              </Button>
            )
          }
        />
      )}
      <AnimatePresence>
        {open && (
          <TaskDialog
            key="create-task"
            server={server}
            onClose={() => setOpen(false)}
          />
        )}
        {remove && (
          <Modal
            key="delete-task"
            title={t("Delete “{{name}}”?", { name: remove.input.name })}
            subtitle={t("This automation will no longer run.")}
            onClose={() => setRemove(null)}
          >
            <div className="modal-actions">
              <Button onClick={() => setRemove(null)}>{t("Keep it")}</Button>
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
                {t("Delete automation")}
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
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
  const { t } = useTranslation();
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
          {t("Automation name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("A quiet-world backup")}
            required
            maxLength={80}
          />
        </label>
        <label>
          {t("When should it run?")}
          <Select
            label={t("When should it run?")}
            value={trigger}
            onValueChange={setTrigger}
            options={[
              { value: "cron", label: t("On a schedule (cron)") },
              { value: "interval", label: t("At a regular interval") },
              { value: "empty", label: t("When the last player leaves") },
              { value: "player_join", label: t("When a player joins") },
              { value: "player_leave", label: t("When a player leaves") },
            ]}
          />
        </label>
        {trigger === "cron" && (
          <div className="form-grid">
            <label>
              {t("Cron expression")}
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                required
              />
              <small>
                {t("Minute · hour · day · month · weekday")}
                <br />
                {t("Weekday: 1 = Sunday … 7 = Saturday.")}
              </small>
            </label>
            <label>
              {t("Timezone")}
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
            {t("Interval in seconds")}
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
            {t("Only this player (optional)")}
            <input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder={t("Any player")}
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
          {t("Only run when the server has no players.")}
        </label>
        <label>
          {t("Then do this")}
          <Select
            label={t("Then do this")}
            value={action}
            onValueChange={setAction}
            options={[
              { value: "command", label: t("Run a Minecraft command") },
              { value: "backup", label: t("Create a backup") },
              { value: "power", label: t("Change server power") },
            ]}
          />
        </label>
        {action === "command" && (
          <label>
            {t("Command")}
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
            <small>
              {t("Use {player} for the player who triggered the event.")}
            </small>
          </label>
        )}
        {action === "backup" && (
          <label>
            {t("Backup destination")}
            <Select
              label={t("Backup destination")}
              value={destination}
              onValueChange={setDestination}
              options={(backups.data?.destinations || ["local"]).map(
                (value) => ({
                  value,
                  label: value === "local" ? t("Local storage") : value,
                }),
              )}
            />
          </label>
        )}
        {action === "power" && (
          <label>
            {t("Power action")}
            <Select
              label={t("Power action")}
              value={signal}
              onValueChange={setSignal}
              options={[
                { value: "restart", label: t("Restart") },
                { value: "stop", label: t("Stop") },
                { value: "start", label: t("Start") },
              ]}
            />
          </label>
        )}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            <Workflow size={14} />
            {t("Create automation")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
