import { useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Archive,
  CircleCheck,
  Cpu,
  HardDrive,
  MoreHorizontal,
  Plus,
  Server,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import type { Activity, GameServer, Overview } from "./types";
import { useWorkspace } from "./context";
import {
  Badge,
  Button,
  CopyButton,
  Empty,
  Progress,
  ago,
  bytes,
  pretty,
  world,
} from "./ui";
import { Chart, Sparkline } from "./Chart";
import { publicFile } from "./assets";

export function ServerCard({ server }: { server: GameServer }) {
  const { navigate, runAction, can } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const online = server.snapshot.state === "online";
  return (
    <article className="server-card">
      <div className="server-card-top">
        <button
          className="server-identity"
          aria-label={`Open ${server.name}`}
          onClick={() => navigate(`/servers/${server.id}`)}
        >
          <img src={publicFile(`worlds/${world(server)}.svg`)} alt="" />
          <span>
            <strong>{server.name}</strong>
            <span className="server-type">
              {pretty(server.template)}
              <i />
              {server.version}
            </span>
          </span>
        </button>
        <div className="server-card-actions">
          <Badge state={server.snapshot.state} />
          <div className="menu-anchor">
            <button
              className="icon-button"
              aria-label={`Actions for ${server.name}`}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menu && (
              <div
                className="popover"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setMenu(false);
                }}
              >
                <button
                  onClick={() => {
                    navigate(`/servers/${server.id}`);
                    setMenu(false);
                  }}
                >
                  Open server
                </button>
                {["start", "stop", "restart"].map((signal) => (
                  <button
                    key={signal}
                    disabled={!can("server.power", server.id)}
                    onClick={() => {
                      void runAction(server.id, { action: "power", signal });
                      setMenu(false);
                    }}
                  >
                    {signal.charAt(0).toUpperCase() + signal.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="server-resources">
        <div>
          <label>
            <span>CPU</span>
            <strong>
              {server.snapshot.cpu_percent.toFixed(0)}
              <small>%</small>
            </strong>
          </label>
          <Progress
            label={`${server.name} CPU usage`}
            value={server.snapshot.cpu_percent / server.cpu_limit}
            color={online ? "orange" : "muted"}
          />
        </div>
        <div>
          <label>
            <span>Memory</span>
            <strong>
              {bytes(server.snapshot.memory_bytes)}
              <small> / {(server.memory_mb / 1024).toFixed(0)} GiB</small>
            </strong>
          </label>
          <Progress
            label={`${server.name} memory usage`}
            value={
              (server.snapshot.memory_bytes / (server.memory_mb * 1024 ** 2)) *
              100
            }
            color={online ? "blue" : "muted"}
          />
        </div>
      </div>
      <footer>
        <span className="address">
          <span className={`dot ${online ? "green" : ""}`} />
          {server.address || `:${server.port}`}
          <CopyButton
            value={server.address || `localhost:${server.port}`}
            label={`Copy address for ${server.name}`}
          />
        </span>
        <span className="player-count">
          <Users size={14} />
          <b>{server.snapshot.players?.online ?? "—"}</b>
          <span>/ {server.max_players}</span>
        </span>
      </footer>
    </article>
  );
}

export function ActivityList({
  activity,
  compact = false,
}: {
  activity: Activity[];
  compact?: boolean;
}) {
  return (
    <div className={`activity-list ${compact ? "compact" : ""}`}>
      {activity.slice(0, compact ? 3 : 50).map((event) => (
        <div className="activity-row" key={event.id}>
          <span
            className={`event-icon ${event.action.toLowerCase().includes("backup") ? "green" : event.action.toLowerCase().includes("install") ? "blue" : ""}`}
          >
            {event.action.toLowerCase().includes("backup") ? (
              <Archive size={15} />
            ) : event.action.toLowerCase().includes("install") ? (
              <Plus size={15} />
            ) : (
              <Zap size={15} />
            )}
          </span>
          <div>
            <strong>{event.action}</strong>
            <span>{event.detail}</span>
          </div>
          <time title={new Date(event.at * 1000).toLocaleString()}>
            {ago(event.at)}
          </time>
        </div>
      ))}
      {!activity.length && (
        <p className="quiet">Your workspace activity will appear here.</p>
      )}
    </div>
  );
}

export default function Dashboard({ overview }: { overview: Overview }) {
  const { newServer, navigate, assistant, can } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState("24h");
  const servers = overview.servers;
  const active = servers.filter((s) => s.snapshot.state === "online").length;
  const players = servers.reduce(
    (sum, s) => sum + (s.snapshot.players?.online || 0),
    0,
  );
  const memory = servers.reduce((sum, s) => sum + s.snapshot.memory_bytes, 0);
  const allocatedMemory =
    servers.reduce((sum, s) => sum + s.memory_mb, 0) * 1024 ** 2;
  const cpu = servers.reduce((sum, s) => sum + s.snapshot.cpu_percent, 0);
  const allocatedCpu = servers.reduce((sum, s) => sum + s.cpu_limit, 0);
  const timeline = new Map<number, number>();
  for (const server of servers)
    for (const metric of server.history || []) {
      const bucket = Math.round(metric.at / 60) * 60;
      timeline.set(bucket, (timeline.get(bucket) || 0) + (metric.players || 0));
    }
  const cutoff =
    Date.now() / 1000 -
    (range === "1h" ? 3600 : range === "6h" ? 21600 : 86400);
  const points = [...timeline]
    .sort((a, b) => a[0] - b[0])
    .filter(([at]) => at >= cutoff)
    .map(([at, value]) => ({ at, value }));
  const shown = servers.filter(
    (s) =>
      filter === "all" ||
      (filter === "online"
        ? s.snapshot.state === "online"
        : s.snapshot.state !== "online"),
  );
  const delta = points.length > 1 ? points.at(-1)!.value - points[0].value : 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            A LITTLE LESS ADMIN. A LOT MORE MINECRAFT.
          </span>
          <h1>
            Your worlds, in good hands<span className="orange-text">.</span>
          </h1>
          <p>A clear view of your servers. More room to build.</p>
        </div>
        <div className="heading-action">
          <span className="live-label">
            <span className="dot green" /> LIVE OVERVIEW
          </span>
          <span className="date-label">
            {new Date().toLocaleDateString("en", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
      <section className="stat-grid" aria-label="Workspace statistics">
        <div className="stat-card">
          <div className="stat-label">
            Servers online
            <Server size={16} />
          </div>
          <div className="stat-number">
            {String(active).padStart(2, "0")}
            <span>/ {String(servers.length).padStart(2, "0")}</span>
          </div>
          <div className="stat-foot">
            <span className="dot green" />
            {active === servers.length && active
              ? "All worlds are up and running"
              : `${servers.length - active} server${servers.length - active === 1 ? "" : "s"} resting, ready when you are`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Players online
            <Users size={16} />
          </div>
          <div className="stat-number">
            {players}
            <Sparkline
              values={points.map((p) => p.value)}
              color="var(--green)"
            />
          </div>
          <div className={`stat-foot ${delta >= 0 ? "green-text" : ""}`}>
            {delta >= 0 ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}
            {delta > 0 ? "+" : ""}
            {delta} <span>over the selected period</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Memory in use
            <HardDrive size={16} />
          </div>
          <div className="stat-number">
            {(memory / 1024 ** 3).toFixed(1)}
            <span>GiB</span>
          </div>
          <div className="stat-foot split">
            <Progress
              value={allocatedMemory ? (memory / allocatedMemory) * 100 : 0}
              color="blue"
            />
            <span>of {bytes(allocatedMemory, 0)}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            CPU utilization
            <Cpu size={16} />
          </div>
          <div className="stat-number">
            {(allocatedCpu ? cpu / allocatedCpu : 0).toFixed(1)}
            <span>%</span>
            <Sparkline values={servers[0]?.history.map((m) => m.cpu) || []} />
          </div>
          <div className="stat-foot">
            Across {allocatedCpu.toFixed(0)} allocated CPU cores
          </div>
        </div>
      </section>
      <div className="overview-middle">
        <section className="panel chart-panel">
          <header className="panel-heading">
            <div>
              <h2>Player activity</h2>
              <p>A little livelier with every login.</p>
            </div>
            <div className="segment">
              {["1h", "6h", "24h"].map((period) => (
                <button
                  key={period}
                  className={range === period ? "active" : ""}
                  onClick={() => setRange(period)}
                >
                  {period}
                </button>
              ))}
            </div>
          </header>
          <Chart points={points} />
          <div className="chart-legend">
            <span>
              <i className="dot orange" /> Players across all servers
            </span>
            <span>
              <b>{players}</b> playing right now
            </span>
          </div>
        </section>
        <section className="ember-card">
          <div className="ember-card-heading">
            <span className="ember-avatar">
              <Sparkles size={22} />
            </span>
            <span className="tag orange-tag">YOUR CO-PILOT</span>
          </div>
          <h2>A second pair of eyes.</h2>
          <p>
            Find the right plugin. Make sense of a log.
            <br />
            Get back to the part you love.
          </p>
          <button
            className="assistant-link"
            onClick={() => assistant(servers[0]?.id)}
          >
            Ask Ember <ArrowUpRight size={17} />
          </button>
          <div className="ember-card-footer">
            <CircleCheck size={13} /> Your confirmation. Every change.
          </div>
          <div className="pixel-motif" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </section>
      </div>
      <section className="servers-section">
        <header className="section-heading">
          <div>
            <h2>
              Your servers <span className="count-badge">{servers.length}</span>
            </h2>
            <p>Every adventure starts somewhere.</p>
          </div>
          <div className="section-tools">
            <div className="segment">
              {["all", "online", "offline"].map((value) => (
                <button
                  key={value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            {can("admin") && (
              <Button variant="ghost" onClick={() => newServer()}>
                <Plus size={16} />
                New server
              </Button>
            )}
          </div>
        </header>
        {shown.length ? (
          <div className="server-grid">
            {shown.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        ) : (
          <Empty
            icon={<Server />}
            title={
              servers.length
                ? "No servers in this view"
                : "Your first world starts here"
            }
            description="Choose a core, set your limits, and let Emberdeck take care of the setup."
            action={
              can("admin") && (
                <Button variant="primary" onClick={() => newServer()}>
                  <Plus size={16} /> Create a server
                </Button>
              )
            }
          />
        )}
      </section>
      <section className="panel recent-activity">
        <header className="panel-heading">
          <h2>Recent activity</h2>
          <button className="text-button" onClick={() => navigate("/activity")}>
            View all <ArrowRight size={14} />
          </button>
        </header>
        <ActivityList activity={overview.activity} compact />
      </section>
    </>
  );
}
