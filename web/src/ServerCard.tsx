import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Box, MoreHorizontal, Users } from "lucide-react";
import type { GameServer } from "./types";
import { useWorkspace } from "./context";
import { Badge, CopyButton, Progress, bytes, pretty } from "./ui";
import { useTranslation } from "./i18n";
import { usePreferences } from "./Preferences";
import { sceneArt, serverArt } from "./scene-art";

function ServerActions({ server }: { server: GameServer }) {
  const { t } = useTranslation();
  const { navigate, runAction, can } = useWorkspace();
  const { motion: animated } = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const anchor = ref.current;
    if (!open || !anchor) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.contains(event.target))
        setOpen(false);
    };
    const blur = (event: FocusEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !anchor.contains(event.relatedTarget)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    anchor.addEventListener("focusout", blur);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      anchor.removeEventListener("focusout", blur);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        ref={trigger}
        className="icon-button server-menu-trigger"
        aria-label={t("Actions for {{name}}", { name: server.name })}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            className="popover"
            initial={animated ? { opacity: 0, y: -5 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: animated ? 0.16 : 0 }}
          >
            <button
              onClick={() => {
                navigate(`/servers/${server.id}`);
                setOpen(false);
              }}
            >
              {t("Open server")}
              <ArrowUpRight size={13} />
            </button>
            {["start", "stop", "restart"].map((signal) => (
              <button
                key={signal}
                disabled={!can("server.power", server.id)}
                onClick={() => {
                  void runAction(server.id, { action: "power", signal });
                  setOpen(false);
                }}
              >
                {t(signal.charAt(0).toUpperCase() + signal.slice(1))}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ServerCard({ server }: { server: GameServer }) {
  const { t } = useTranslation();
  const { motion: animated } = usePreferences();
  const online = server.snapshot.state === "online";
  return (
    <motion.article
      className={`server-card ${online ? "is-online" : "is-resting"}`}
      layout={animated ? "position" : false}
      initial={animated ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: animated ? 0.98 : 1 }}
      transition={{ duration: animated ? 0.26 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <a
        className="card-hitarea"
        data-cursor-target="parent"
        href={`#/servers/${server.id}`}
        aria-label={t("Open {{name}}", { name: server.name })}
      />
      <div className="server-cover" aria-hidden="true">
        <img
          src={sceneArt(serverArt(server), true)}
          alt=""
          loading="eager"
          draggable={false}
        />
        <div className="server-cover-shade" />
        <span className="world-edition">MINECRAFT JAVA</span>
        <ArrowUpRight className="server-cover-arrow" size={19} />
      </div>
      <div className="server-card-actions">
        <Badge state={server.snapshot.state} />
        <ServerActions server={server} />
      </div>
      <div className="server-card-top">
        <div className="server-identity">
          <span className={`core-mark core-${server.template}`}>
            <Box size={19} strokeWidth={1.5} />
          </span>
          <span>
            <strong>{server.name}</strong>
            <span className="server-type">
              {pretty(server.template)}
              <i />
              {server.version}
            </span>
          </span>
        </div>
      </div>
      <div className="server-resources">
        <div>
          <div className="resource-label">
            <span>CPU</span>
            <strong>
              {server.snapshot.cpu_percent.toFixed(0)}
              <small>%</small>
            </strong>
          </div>
          <Progress
            label={t("{{name}} CPU usage", { name: server.name })}
            value={server.snapshot.cpu_percent / server.cpu_limit}
            color={online ? "orange" : "muted"}
          />
        </div>
        <div>
          <div className="resource-label">
            <span>{t("Memory")}</span>
            <strong>
              {bytes(server.snapshot.memory_bytes)}
              <small>
                {" "}
                / {(server.memory_mb / 1024).toFixed(0)} {t("GiB")}
              </small>
            </strong>
          </div>
          <Progress
            label={t("{{name}} memory usage", { name: server.name })}
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
          <span>{server.address || `:${server.port}`}</span>
          <CopyButton
            value={server.address || `localhost:${server.port}`}
            label={t("Copy address for {{name}}", { name: server.name })}
          />
        </span>
        <span className="player-count">
          <Users size={13} />
          <b>{server.snapshot.players?.online ?? "—"}</b>
          <span>/ {server.max_players}</span>
        </span>
      </footer>
    </motion.article>
  );
}
