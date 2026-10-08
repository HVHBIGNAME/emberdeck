import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Archive,
  CircleCheck,
  Cpu,
  HardDrive,
  Plus,
  Server,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import type { Activity, Overview } from "./types";
import { useWorkspace } from "./context";
import { Progress, ago, bytes } from "./ui";
import { Chart, Sparkline } from "./Chart";
import { sceneArt } from "./scene-art";
import { ServerCard } from "./ServerCard";
import { SegmentedControl } from "./SegmentedControl";
import { ServerFleet } from "./ServerFleet";
import { useTranslation, locale } from "./i18n";
import { usePreferences } from "./Preferences";
import { Count } from "./Motion";

export { ServerCard };

export function ActivityList({
  activity,
  compact = false,
}: {
  activity: Activity[];
  compact?: boolean;
}) {
  const { t } = useTranslation();
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
            <strong>{t(event.action)}</strong>
            <span>{event.detail}</span>
          </div>
          <time title={new Date(event.at * 1000).toLocaleString(locale())}>
            {ago(event.at)}
          </time>
        </div>
      ))}
      {!activity.length && (
        <p className="quiet">
          {t("Your workspace activity will appear here.")}
        </p>
      )}
    </div>
  );
}

function StatCard({ children, index }: { children: ReactNode; index: number }) {
  const { motion: enabled } = usePreferences();
  return (
    <motion.div
      className="stat-card"
      initial={enabled ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: enabled ? 0.45 : 0,
        delay: enabled ? index * 0.055 : 0,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export default function Dashboard({ overview }: { overview: Overview }) {
  const { t } = useTranslation();
  const { navigate, assistant } = useWorkspace();
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
  const delta = points.length > 1 ? points.at(-1)!.value - points[0].value : 0;
  return (
    <div className="dashboard-layout">
      <div className="page-heading dashboard-hero">
        <img
          className="dashboard-hero-image"
          src={sceneArt("overworld")}
          alt=""
          fetchPriority="high"
        />
        <div className="dashboard-hero-shade" />
        <div>
          <span className="eyebrow">
            {t("A LITTLE LESS ADMIN. A LOT MORE MINECRAFT.")}
          </span>
          <h1>
            {t("Your worlds, in good hands")}
            <span className="orange-text">.</span>
          </h1>
          <p>{t("A clear view of your servers. More room to build.")}</p>
        </div>
        <div className="heading-action">
          <span className="live-label">
            <span className="dot green" /> {t("LIVE OVERVIEW")}
          </span>
          <span className="date-label">
            {new Date().toLocaleDateString(locale(), {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
      <section className="stat-grid" aria-label={t("Workspace statistics")}>
        <StatCard index={0}>
          <div className="stat-label">
            {t("Servers online")}
            <Server size={16} />
          </div>
          <div className="stat-number">
            <Count value={active} />
            <span>/ {servers.length}</span>
          </div>
          <div className="stat-foot">
            <span className="dot green" />
            {active === servers.length && active
              ? t("All worlds are up and running")
              : t("{{count}} servers resting, ready when you are", {
                  count: servers.length - active,
                })}
          </div>
        </StatCard>
        <StatCard index={1}>
          <div className="stat-label">
            {t("Players online")}
            <Users size={16} />
          </div>
          <div className="stat-number">
            <Count value={players} />
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
            {delta} <span>{t("over the selected period")}</span>
          </div>
        </StatCard>
        <StatCard index={2}>
          <div className="stat-label">
            {t("Memory in use")}
            <HardDrive size={16} />
          </div>
          <div className="stat-number">
            <Count value={memory / 1024 ** 3} decimals={1} />
            <span>{t("GiB")}</span>
          </div>
          <div className="stat-foot split">
            <Progress
              value={allocatedMemory ? (memory / allocatedMemory) * 100 : 0}
              color="blue"
            />
            <span>
              {t("of {{amount}}", { amount: bytes(allocatedMemory, 0) })}
            </span>
          </div>
        </StatCard>
        <StatCard index={3}>
          <div className="stat-label">
            {t("CPU utilization")}
            <Cpu size={16} />
          </div>
          <div className="stat-number">
            <Count value={allocatedCpu ? cpu / allocatedCpu : 0} decimals={1} />
            <span>%</span>
            <Sparkline values={servers[0]?.history.map((m) => m.cpu) || []} />
          </div>
          <div className="stat-foot">
            {t("Across {{count}} allocated CPU cores", {
              count: Math.round(allocatedCpu),
            })}
          </div>
        </StatCard>
      </section>
      <ServerFleet servers={servers} />
      <div className="overview-middle">
        <section className="panel chart-panel">
          <header className="panel-heading">
            <div>
              <h2>{t("Player activity")}</h2>
              <p>{t("A little livelier with every login.")}</p>
            </div>
            <SegmentedControl
              label={t("Activity period")}
              value={range}
              onChange={setRange}
              options={["1h", "6h", "24h"].map((value) => ({
                value,
                label: t(value),
              }))}
            />
          </header>
          <Chart points={points} />
          <div className="chart-legend">
            <span>
              <i className="dot orange" /> {t("Players across all servers")}
            </span>
            <span>
              <b>{players}</b> {t("playing right now")}
            </span>
          </div>
        </section>
        <section className="ember-card">
          <img
            className="ember-card-image"
            src={sceneArt("end", true)}
            alt=""
            loading="lazy"
          />
          <div className="ember-card-shade" />
          <div className="ember-card-heading">
            <span className="ember-avatar">
              <Sparkles size={22} />
            </span>
            <span className="tag orange-tag">{t("YOUR CO-PILOT")}</span>
          </div>
          <h2>{t("A second pair of eyes.")}</h2>
          <p>
            {t("Find the right plugin. Make sense of a log.")}
            <br />
            {t("Get back to the part you love.")}
          </p>
          <button
            className="assistant-link"
            onClick={() => assistant(servers[0]?.id)}
          >
            {t("Ask Ember")} <ArrowUpRight size={17} />
          </button>
          <div className="ember-card-footer">
            <CircleCheck size={13} /> {t("Your confirmation. Every change.")}
          </div>
        </section>
      </div>
      <section className="panel recent-activity">
        <header className="panel-heading">
          <h2>{t("Recent activity")}</h2>
          <button className="text-button" onClick={() => navigate("/activity")}>
            {t("View all")} <ArrowRight size={14} />
          </button>
        </header>
        <ActivityList activity={overview.activity} compact />
      </section>
    </div>
  );
}
