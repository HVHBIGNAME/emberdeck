import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  Cpu,
  Download,
  Files,
  HardDrive,
  Info,
  Play,
  Puzzle,
  RotateCw,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { api, post, useApi } from "./api";
import { useWorkspace } from "./context";
import type { GameServer, Package } from "./types";
import {
  Badge,
  Button,
  CopyButton,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  bytes,
  pretty,
  saveFile,
  world,
} from "./ui";
import { Chart } from "./Chart";
import { BackupsPage, AutomationsPage } from "./operations";
import { FilesPage } from "./FilesPage";
import { LibraryPage } from "./Library";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { publicFile } from "./assets";

const tabs = [
  ["overview", "Overview", Activity],
  ["console", "Console", Terminal],
  ["files", "Files", Files],
  ["packages", "Packages", Puzzle],
  ["backups", "Backups", Archive],
  ["automations", "Automations", Workflow],
  ["diagnostics", "Diagnostics", ShieldCheck],
  ["settings", "Settings", Settings],
] as const;

export default function ServerPage({ id }: { id: string }) {
  const { revision, navigate, runAction, assistant, can } = useWorkspace();
  const result = useApi<GameServer>(`/api/servers/${id}`, 5000, revision);
  const tab = window.location.hash.split("/")[3] || "overview";
  if (!result.data)
    return result.error ? (
      <ErrorBox error={result.error} retry={() => void result.refresh()} />
    ) : (
      <Loading />
    );
  const server = result.data;
  const online = ["online", "starting"].includes(server.snapshot.state);
  return (
    <>
      <div className="server-page-header">
        <img
          className="server-hero"
          src={publicFile(`worlds/${world(server)}.svg`)}
          alt=""
        />
        <div>
          <h1>{server.name}</h1>
          <div className="server-meta">
            <Badge state={server.snapshot.state} />
            <span>
              {pretty(server.template)} · {server.version}
            </span>
            <span>·</span>
            <span>{server.node_name}</span>
            <span className="address">
              {server.address}
              <CopyButton
                value={server.address || `localhost:${server.port}`}
              />
            </span>
          </div>
        </div>
        <div className="server-power">
          <Button
            disabled={!can("server.power", id) || !online}
            onClick={() =>
              void runAction(id, { action: "power", signal: "restart" })
            }
          >
            <RotateCw size={14} />
            Restart
          </Button>
          <Button
            variant={online ? "secondary" : "primary"}
            disabled={!can("server.power", id)}
            onClick={() =>
              void runAction(id, {
                action: "power",
                signal: online ? "stop" : "start",
              })
            }
          >
            {online ? (
              <>
                <Square size={12} />
                Stop
              </>
            ) : (
              <>
                <Play size={13} />
                Start server
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Server sections">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => navigate(`/servers/${id}/${key}`)}
          >
            <Icon size={13} />
            {key === "packages"
              ? ["fabric", "forge", "neoforge", "quilt"].includes(
                  server.template,
                )
                ? "Mods"
                : server.template === "arclight"
                  ? "Mods & plugins"
                  : "Plugins"
              : label}
          </button>
        ))}
      </div>
      <ErrorBox error={result.error || server.snapshot.error} />
      {tab === "overview" && (
        <>
          <section className="stat-grid">
            {[
              [
                Users,
                "Players online",
                server.snapshot.players
                  ? String(server.snapshot.players.online)
                  : "—",
                `/ ${server.max_players} slots`,
              ],
              [
                Cpu,
                "CPU use",
                `${server.snapshot.cpu_percent.toFixed(1)}%`,
                `${server.cpu_limit} cores available`,
              ],
              [
                HardDrive,
                "Memory",
                bytes(server.snapshot.memory_bytes),
                `${server.memory_mb / 1024} GiB limit`,
              ],
              [
                Archive,
                "Disk use",
                bytes(server.snapshot.disk_bytes),
                `${server.disk_mb / 1024} GiB budget`,
              ],
            ].map(([Icon, label, value, foot], i) => {
              const RenderIcon = Icon as typeof Users;
              return (
                <div className="stat-card" key={i}>
                  <div className="stat-label">
                    {String(label)}
                    <RenderIcon size={16} />
                  </div>
                  <div className="stat-number" style={{ fontSize: 27 }}>
                    {String(value)}
                  </div>
                  <div className="stat-foot">{String(foot)}</div>
                </div>
              );
            })}
          </section>
          <div className="server-detail-grid">
            <section className="panel">
              <header className="panel-heading">
                <div>
                  <h2>CPU over time</h2>
                  <p>100% represents one fully utilized core.</p>
                </div>
                <Cpu size={17} className="muted" />
              </header>
              <Chart
                points={server.history.map((m) => ({ at: m.at, value: m.cpu }))}
                unit="% CPU"
                height={190}
              />
            </section>
            <section className="panel settings-card">
              <h2>A place to call home.</h2>
              <p style={{ marginBottom: 17 }}>
                {server.snapshot.motd.replace(/§[0-9a-fk-or]/gi, "")}
              </p>
              <div className="credential">
                <span>Core</span>
                <code>
                  {pretty(server.template)} · {server.version}
                </code>
              </div>
              <div className="credential">
                <span>Runtime</span>
                <code>Java {server.java || "auto-selected"}</code>
              </div>
              <div className="credential">
                <span>Environment</span>
                <code>Docker · isolated network</code>
              </div>
              <Button
                variant="ghost"
                style={{ marginTop: 12 }}
                onClick={() => assistant(id)}
              >
                Ask Ember about this server
                <ArrowUpRight size={14} />
              </Button>
            </section>
          </div>
          <div style={{ marginTop: 22 }}>
            <Console server={server} preview />
          </div>
        </>
      )}
      {tab === "console" && <Console server={server} />}
      {tab === "files" && <FilesPage server={server} />}
      {tab === "packages" && <Packages server={server} />}
      {tab === "backups" && <BackupsPage server={server} />}
      {tab === "automations" && <AutomationsPage server={server} />}
      {tab === "diagnostics" && <DiagnosticsPage server={server} />}
      {tab === "settings" && <ServerSettings server={server} />}
    </>
  );
}

function Console({
  server,
  preview = false,
}: {
  server: GameServer;
  preview?: boolean;
}) {
  const { runAction, can, navigate } = useWorkspace();
  const logs = useApi<{ text: string }>(
    `/api/servers/${server.id}/logs?tail=${preview ? 14 : 500}`,
    2500,
  );
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (auto && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.data?.text, auto]);
  return (
    <div className="terminal">
      <header className="terminal-toolbar">
        <span className="dot green" /> LIVE CONSOLE
        <div className="terminal-actions">
          {preview ? (
            <button
              className="text-button"
              onClick={() => navigate(`/servers/${server.id}/console`)}
            >
              Open console
              <ArrowUpRight size={12} />
            </button>
          ) : (
            <>
              <label
                className="checkbox"
                style={{ fontSize: 9, letterSpacing: 0, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                Auto-scroll
              </label>
              <button
                className="icon-button"
                aria-label="Download console log"
                onClick={() =>
                  saveFile(`${server.name}.log`, logs.data?.text || "")
                }
              >
                <Download size={15} />
              </button>
            </>
          )}
        </div>
      </header>
      <ErrorBox error={logs.error} />
      <div
        ref={logRef}
        className="terminal-log"
        style={preview ? { minHeight: 230, maxHeight: 260 } : undefined}
      >
        {logs.data?.text.split("\n").map((line, i) => {
          const match = line.match(/^(.*?\[(?:[^\]]+?)\])\s?(.*)$/);
          return (
            <div key={i}>
              {match ? (
                <>
                  <span
                    className={
                      line.includes("ERROR") || line.includes("Exception")
                        ? "log-error"
                        : line.includes("WARN")
                          ? "log-warn"
                          : "log-time"
                    }
                  >
                    {match[1]}
                  </span>{" "}
                  <span
                    className={
                      /Done \(|joined the game|Successfully enabled/.test(line)
                        ? "log-info"
                        : ""
                    }
                  >
                    {match[2]}
                  </span>
                </>
              ) : (
                line || "\u00a0"
              )}
            </div>
          );
        })}
        {logs.loading && "Connecting to the node…"}
      </div>
      {output && <div className="console-output">{output}</div>}
      <form
        className="console-input"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!command.trim()) return;
          setBusy(true);
          const result = await runAction(server.id, {
            action: "command",
            command,
          });
          setBusy(false);
          if (result) {
            setOutput(String(result.output));
            setCommand("");
          }
        }}
      >
        <ChevronPrompt />
        <input
          aria-label="Console command"
          placeholder={
            can("console.write", server.id)
              ? "Type a command…"
              : "Read-only console"
          }
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={!can("console.write", server.id)}
          maxLength={2000}
        />
        <Button
          type="submit"
          variant="ghost"
          busy={busy}
          disabled={!command.trim() || !can("console.write", server.id)}
        >
          <Send size={13} />
          Send
        </Button>
      </form>
    </div>
  );
}
function ChevronPrompt() {
  return (
    <span className="mono" aria-hidden="true">
      ›
    </span>
  );
}

function Packages({ server }: { server: GameServer }) {
  const { revision, runAction, can } = useWorkspace();
  const [browse, setBrowse] = useState(false);
  const packages = useApi<{ packages: Package[] }>(
    `/api/servers/${server.id}/packages`,
    6000,
    revision,
  );
  if (browse)
    return (
      <>
        <div className="toolbar">
          <Button onClick={() => setBrowse(false)}>← Installed packages</Button>
        </div>
        <LibraryPage server={server} />
      </>
    );
  return (
    <>
      <div className="toolbar">
        <span className="tag">
          {packages.data?.packages.filter((p) => p.enabled).length || 0} ENABLED
        </span>
        <span className="muted" style={{ fontSize: 10 }}>
          Changes take effect after a restart.
        </span>
        <Button
          variant="primary"
          disabled={!can("packages.write", server.id)}
          onClick={() => setBrowse(true)}
        >
          <Puzzle size={15} />
          Browse library
        </Button>
      </div>
      <ErrorBox error={packages.error} />
      {packages.loading ? (
        <Loading />
      ) : packages.data?.packages.length ? (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Type</th>
                <th>Source</th>
                <th>Size</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {packages.data.packages.map((p) => (
                <tr key={p.path}>
                  <td>
                    <span className="file-name">
                      <Puzzle size={16} />
                      <strong>{p.name}</strong>
                    </span>
                    {p.metadata && (
                      <small>SHA-256 · {p.metadata.sha256.slice(0, 16)}</small>
                    )}
                  </td>
                  <td>
                    <span className="tag">{p.kind}</span>
                  </td>
                  <td>{p.source}</td>
                  <td>{bytes(p.size)}</td>
                  <td>
                    <button
                      className={`switch ${p.enabled ? "on" : ""}`}
                      role="switch"
                      aria-checked={p.enabled}
                      aria-label={`Enable ${p.name}`}
                      disabled={!can("packages.write", server.id)}
                      onClick={() =>
                        void runAction(server.id, {
                          action: "toggle_package",
                          path: p.path,
                          enabled: !p.enabled,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<Puzzle />}
          title="A little extra possibility"
          description="Find plugins or mods for this exact core and Minecraft version. Required dependencies are resolved automatically."
          action={
            <Button variant="primary" onClick={() => setBrowse(true)}>
              Browse compatible packages
            </Button>
          }
        />
      )}
      <p className="quiet">
        Disabling renames a JAR to <code>.jar.disabled</code>. Configurations
        are kept. Nothing is hot-unloaded.
      </p>
    </>
  );
}

function ServerSettings({ server }: { server: GameServer }) {
  const { can, notify, refresh, navigate } = useWorkspace();
  const [name, setName] = useState(server.name);
  const [memory, setMemory] = useState(server.memory_mb);
  const [cpu, setCpu] = useState(server.cpu_limit);
  const [disk, setDisk] = useState(server.disk_mb);
  const [port, setPort] = useState(server.port);
  const [motd, setMotd] = useState(server.motd);
  const [players, setPlayers] = useState(server.max_players);
  const [java, setJava] = useState(server.java?.toString() || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [remove, setRemove] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const stopped = ["offline", "crashed"].includes(server.snapshot.state);
  if (!can("admin"))
    return (
      <ErrorBox error="Resource and server configuration requires an administrator token." />
    );
  return (
    <>
      <form
        className="settings-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await post(
              `/api/servers/${server.id}`,
              {
                name,
                node_id: server.node_id,
                template: server.template,
                version: server.version,
                loader_version: server.loader_version,
                memory_mb: memory,
                cpu_limit: cpu,
                disk_mb: disk,
                port,
                max_players: players,
                motd,
                java: java ? Number(java) : null,
                modpack: server.modpack,
                environment: server.environment,
                accept_eula: true,
              },
              "PUT",
            );
            refresh();
            notify(
              "Configuration saved. Start the server to use the new limits.",
            );
          } catch (error) {
            setError(
              error instanceof Error
                ? error
                : new Error("Could not save configuration"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="panel settings-card">
          <h2>A name. A welcome. A world.</h2>
          <p>Server identity and connection settings.</p>
          <div className="form-stack">
            <label>
              Server name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label>
              Message of the day
              <input
                value={motd}
                onChange={(e) => setMotd(e.target.value)}
                required
                maxLength={256}
              />
            </label>
            <div className="form-grid">
              <label>
                Game port
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </label>
              <label>
                Maximum players
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={players}
                  onChange={(e) => setPlayers(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
        </section>
        <section className="panel settings-card">
          <h2>Room to grow.</h2>
          <p>Hard CPU / memory limits and a monitored disk budget.</p>
          <div className="form-stack">
            <div className="form-grid">
              <label>
                Memory (MiB)
                <input
                  type="number"
                  min={512}
                  step={256}
                  value={memory}
                  onChange={(e) => setMemory(Number(e.target.value))}
                />
              </label>
              <label>
                CPU cores
                <input
                  type="number"
                  min={0.25}
                  max={128}
                  step={0.25}
                  value={cpu}
                  onChange={(e) => setCpu(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Disk budget (MiB)
                <input
                  type="number"
                  min={1024}
                  step={1024}
                  value={disk}
                  onChange={(e) => setDisk(Number(e.target.value))}
                />
              </label>
              <label>
                Java runtime
                <select value={java} onChange={(e) => setJava(e.target.value)}>
                  <option value="">Auto-select</option>
                  {[8, 17, 21, 25].map((j) => (
                    <option key={j} value={j}>
                      Java {j}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="notice">
              <Info size={16} />
              <span>
                Stop the server before changing its configuration. Its container
                will be recreated on the next start.
              </span>
            </div>
          </div>
        </section>
        <div style={{ gridColumn: "1 / -1" }}>
          <ErrorBox error={error} />
          <div className="toolbar">
            <span className="tag">
              {pretty(server.template)} · {server.version}
            </span>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              disabled={!stopped}
            >
              <Settings size={14} />
              Save configuration
            </Button>
          </div>
        </div>
      </form>
      <section
        className="panel settings-card"
        style={{ marginTop: 20, borderColor: "#51343b" }}
      >
        <h2>Remove this server</h2>
        <p>
          Stop and remove its container. Server files are moved to a
          deleted-server archive on the node; existing backups are kept.
        </p>
        <Button
          variant="danger"
          disabled={!stopped}
          onClick={() => {
            setRemove(true);
            setConfirmation("");
          }}
        >
          <Trash2 size={14} />
          Remove server
        </Button>
      </section>
      {remove && (
        <Modal
          title={`Remove “${server.name}”?`}
          subtitle="The server must be stopped. Its files will be archived on the node."
          onClose={() => setRemove(false)}
        >
          <label>
            Type the server name
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={server.name}
            />
          </label>
          <div className="modal-actions">
            <Button onClick={() => setRemove(false)}>Keep server</Button>
            <Button
              variant="danger"
              disabled={confirmation !== server.name}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/servers/${server.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({ confirmation }),
                  });
                  refresh();
                  navigate("/servers");
                  notify("Server removed. Files archived on the node.");
                } catch (error) {
                  notify(String(error), true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove server
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
