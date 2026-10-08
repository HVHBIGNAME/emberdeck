import { useEffect, useState, type KeyboardEvent } from "react";
import {
  Activity,
  Archive,
  Files,
  MoreHorizontal,
  Puzzle,
  Settings,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";
import { useWorkspace } from "./context";
import { useMedia } from "./Preferences";
import { useTranslation } from "./i18n";
import { AnimatePresence, Modal } from "./ui";

const sections = [
  ["overview", "Overview", Activity],
  ["console", "Console", Terminal],
  ["files", "Files", Files],
  ["packages", "Packages", Puzzle],
  ["backups", "Backups", Archive],
  ["automations", "Automations", Workflow],
  ["diagnostics", "Diagnostics", ShieldCheck],
  ["settings", "Settings", Settings],
] as const;

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ];
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) %
          items.length;
  items[index]?.focus();
}

export function ServerSections({
  id,
  template,
  tab,
}: {
  id: string;
  template: string;
  tab: string;
}) {
  const { t } = useTranslation();
  const { navigate } = useWorkspace();
  const narrow = useMedia("(max-width: 1000px)");
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [tab, narrow]);
  const labels = sections.map(([key, label, Icon]) => ({
    key,
    Icon,
    label: t(
      key !== "packages"
        ? label
        : ["fabric", "forge", "neoforge", "quilt"].includes(template)
          ? "Mods"
          : template === "arclight"
            ? "Mods & plugins"
            : "Plugins",
    ),
  }));
  const additional = labels.slice(3);
  const selected = additional.find(({ key }) => key === tab);
  const MoreIcon = selected?.Icon || MoreHorizontal;
  return (
    <>
      <div
        className={`tabs server-sections ${narrow ? "compact-sections" : ""}`}
        role="tablist"
        tabIndex={-1}
        aria-label={t("Server sections")}
        onKeyDown={moveFocus}
      >
        {(narrow ? labels.slice(0, 3) : labels).map(({ key, label, Icon }) => (
          <button
            key={key}
            id={`server-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls="server-content"
            tabIndex={tab === key ? 0 : -1}
            className={tab === key ? "active" : ""}
            onClick={() => navigate(`/servers/${id}/${key}`)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        {narrow && (
          <button
            id={selected ? `server-tab-${tab}` : undefined}
            role={selected ? "tab" : "button"}
            aria-selected={selected ? true : undefined}
            aria-controls={selected ? "server-content" : undefined}
            aria-label={selected?.label || t("More server sections")}
            aria-haspopup="dialog"
            aria-expanded={more}
            className={selected ? "active" : ""}
            onClick={() => setMore(true)}
          >
            <MoreIcon size={16} aria-hidden="true" />
            <span>{selected?.label || t("More")}</span>
          </button>
        )}
      </div>
      <AnimatePresence>
        {more && narrow && (
          <Modal
            title="Server sections"
            className="mobile-sheet"
            onClose={() => setMore(false)}
          >
            <div className="mobile-menu-grid">
              {additional.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  aria-current={tab === key ? "page" : undefined}
                  onClick={() => {
                    setMore(false);
                    navigate(`/servers/${id}/${key}`);
                  }}
                >
                  <Icon size={21} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
