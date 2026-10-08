import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus, Server } from "lucide-react";
import type { GameServer } from "./types";
import { useWorkspace } from "./context";
import { Button, Empty } from "./ui";
import { useTranslation } from "./i18n";
import { SegmentedControl } from "./SegmentedControl";
import { ServerCard } from "./ServerCard";

export function ServerFleet({ servers }: { servers: GameServer[] }) {
  const { t } = useTranslation();
  const { can, newServer } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const shown = servers.filter(
    (server) =>
      filter === "all" ||
      (filter === "online"
        ? server.snapshot.state === "online"
        : server.snapshot.state !== "online"),
  );
  return (
    <section className="servers-section">
      <header className="section-heading">
        <div>
          <h2>
            {t("Your servers")}{" "}
            <span className="count-badge">{servers.length}</span>
          </h2>
          <p>{t("Every adventure starts somewhere.")}</p>
        </div>
        <div className="section-tools">
          <SegmentedControl
            label={t("Server status")}
            value={filter}
            onChange={setFilter}
            options={["all", "online", "offline"].map((value) => ({
              value,
              label: t(value.charAt(0).toUpperCase() + value.slice(1)),
            }))}
          />
          {can("admin") && (
            <Button
              variant="ghost"
              aria-label={t("New server")}
              onClick={() => newServer()}
            >
              <Plus size={15} />
              <span>{t("New server")}</span>
            </Button>
          )}
        </div>
      </header>
      {shown.length ? (
        <div className="server-grid">
          <AnimatePresence>
            {shown.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </AnimatePresence>
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
                <Plus size={16} />
                {t("Create a server")}
              </Button>
            )
          }
        />
      )}
    </section>
  );
}
