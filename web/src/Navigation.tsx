import { motion } from "motion/react";
import {
  Activity,
  Archive,
  Box,
  LayoutDashboard,
  Network,
  Puzzle,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { usePreferences } from "./Preferences";
import { useTranslation } from "./i18n";

export const mainLinks = [
  ["overview", "Overview", LayoutDashboard],
  ["servers", "Servers", Server],
  ["library", "Library", Puzzle],
  ["blueprints", "Blueprints", Box],
  ["automations", "Automations", Workflow],
  ["backups", "Backups", Archive],
] as const;
export const workspaceLinks = [
  ["nodes", "Nodes", Network],
  ["access", "Access & tokens", ShieldCheck],
  ["activity", "Activity", Activity],
  ["settings", "Settings", SlidersHorizontal],
] as const;

export function NavigationGroup({
  links,
  page,
  count,
  label,
  onNavigate,
}: {
  links: readonly (readonly [string, string, LucideIcon])[];
  page: string;
  count: number;
  label: string;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { motion: animated } = usePreferences();
  return (
    <nav aria-label={t(label)}>
      {links.map(([id, name, Icon]) => (
        <a
          href={`#/${id}`}
          key={id}
          className={`nav-link ${page === id ? "active" : ""}`}
          aria-current={page === id ? "page" : undefined}
          onClick={onNavigate}
        >
          {page === id && (
            <motion.span
              className="nav-active"
              layoutId={animated ? "workspace-active-link" : undefined}
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 38,
                duration: animated ? undefined : 0,
              }}
            />
          )}
          <Icon size={17} />
          <span>{t(name)}</span>
          {id === "servers" && <span className="nav-counter">{count}</span>}
        </a>
      ))}
    </nav>
  );
}
