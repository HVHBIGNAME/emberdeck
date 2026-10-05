import { useState } from "react";
import { motion } from "motion/react";
import { Activity, Check, X } from "lucide-react";
import { useApi } from "./api";
import type { Job } from "./types";
import { ErrorBox } from "./ui";
import { messageText, useTranslation } from "./i18n";
import { usePreferences } from "./Preferences";

export function JobDock({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { motion: animated } = usePreferences();
  const [expanded, setExpanded] = useState(true);
  const jobs = useApi<{ jobs: Job[] }>(`/api/servers/${serverId}/jobs`, 2000);
  const active = jobs.data?.jobs.filter((job) => job.state === "running") || [];
  return (
    <motion.aside
      className={`job-dock ${expanded ? "expanded" : ""}`}
      initial={animated ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: animated ? 12 : 0 }}
      transition={{ duration: animated ? 0.2 : 0 }}
    >
      <header>
        <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <Activity size={15} /> {t("Operations")}{" "}
          {active.length > 0 && (
            <span className="count-badge">{active.length}</span>
          )}
        </button>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Close operations")}
        >
          <X size={15} />
        </button>
      </header>
      {expanded && (
        <div className="job-list">
          <ErrorBox error={jobs.error} />
          {jobs.data?.jobs.slice(0, 6).map((job) => (
            <div key={job.id} className={`job ${job.state}`}>
              <div>
                <strong>
                  {t(job.kind.charAt(0).toUpperCase() + job.kind.slice(1))}
                </strong>
                <span>
                  {job.state === "completed" ? (
                    <Check size={14} />
                  ) : (
                    t(job.state.charAt(0).toUpperCase() + job.state.slice(1))
                  )}
                </span>
              </div>
              <p>{messageText(job.error || job.progress)}</p>
              {job.result && (
                <details>
                  <summary>{t("Result details")}</summary>
                  <pre>{JSON.stringify(job.result, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
          {!jobs.data?.jobs.length && (
            <p className="quiet">{t("Waiting for the node…")}</p>
          )}
        </div>
      )}
    </motion.aside>
  );
}
