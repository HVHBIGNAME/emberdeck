import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Command,
  ExternalLink,
  Plus,
  Search,
  Server,
  Sparkles,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ApiError, demo, post, useApi } from "./api";
import type { Identity, Overview } from "./types";
import { WorkspaceContext, type Workspace } from "./context";
import { Button, ErrorBox, Loading, Logo, Modal } from "./ui";
import Dashboard, { ActivityList, ServerCard } from "./dashboard";
import { NewServer } from "./NewServer";
import ServerPage from "./ServerPage";
import { AccessPage, BlueprintsPage, NodesPage } from "./WorkspacePages";
import { LibraryPage } from "./Library";
import { AutomationsPage, BackupsPage } from "./operations";
import { Assistant } from "./Assistant";
import { InstallPage } from "./InstallPage";
import { Login } from "./Login";
import { SettingsPage } from "./SettingsPage";
import { PageTransition } from "./Motion";
import { usePreferences } from "./Preferences";
import { messageText, useTranslation } from "./i18n";
import { mainLinks, workspaceLinks, NavigationGroup } from "./Navigation";
import { JobDock } from "./JobDock";
import { MobileNavigation } from "./MobileNavigation";
import { WorkspaceProfile } from "./WorkspaceProfile";

export default function App({
  onReady,
}: {
  onReady: (failed?: boolean) => void;
}) {
  const { t } = useTranslation();
  const { motion: animated } = usePreferences();
  const identity = useApi<Identity>("/api/auth/me");
  const [revision, setRevision] = useState(0);
  const overview = useApi<Overview>(
    identity.data ? "/api/overview" : null,
    5000,
    revision,
  );
  const [route, setRoute] = useState(
    window.location.hash.slice(1) || "/overview",
  );
  const [newTemplate, setNewTemplate] = useState<string | null>(null);
  const [newModpack, setNewModpack] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [assistantServer, setAssistantServer] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [jobServer, setJobServer] = useState<string | null>(null);
  const navigate = useCallback((path: string) => {
    window.location.hash = path;
  }, []);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (route === "/install" || (route === "/settings" && !identity.data)) {
      onReady();
    } else if (!identity.loading) {
      if (!identity.data) {
        const login =
          identity.error instanceof ApiError && identity.error.status === 401;
        onReady(!login);
      } else if (overview.error) {
        onReady(true);
      } else if (overview.data) {
        onReady();
      }
    }
  }, [
    identity.loading,
    identity.data,
    identity.error,
    overview.data,
    overview.error,
    route,
    onReady,
  ]);
  useEffect(() => {
    const listener = (event: HashChangeEvent) => {
      const next = window.location.hash.slice(1) || "/overview";
      const previous = new URL(event.oldURL).hash.slice(1) || "/overview";
      setRoute(next);
      if (
        previous.split("/").slice(0, 3).join("/") !==
        next.split("/").slice(0, 3).join("/")
      )
        window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), toast.error ? 8000 : 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSearch((value) => !value);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const workspace = useMemo<Workspace | null>(
    () =>
      identity.data
        ? {
            user: identity.data.user,
            servers: overview.data?.servers || [],
            revision,
            refresh,
            navigate,
            notify,
            newServer: (template, modpack, version) => {
              setNewModpack(modpack || "");
              setNewVersion(version || "");
              setNewTemplate(template || "paper");
            },
            assistant: (id) =>
              setAssistantServer(id || overview.data?.servers[0]?.id || ""),
            can: (permission, serverId) =>
              identity.data!.user.role === "admin" ||
              (identity.data!.user.permissions.includes(permission) &&
                (!serverId ||
                  identity.data!.user.server_ids.some(
                    (id) => id === "*" || id === serverId,
                  ))),
            runAction: async (id, body) => {
              try {
                const result = await post<Record<string, unknown>>(
                  `/api/servers/${id}/actions`,
                  body,
                );
                if (result.id && result.state === "running") {
                  setJobServer(id);
                  notify("Operation queued. Follow its progress below.");
                } else if (body.action !== "sftp")
                  notify(
                    body.action === "toggle_package"
                      ? "Package updated. Restart the server to apply."
                      : "Change saved.",
                  );
                refresh();
                return result;
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "Operation failed",
                  true,
                );
                return null;
              }
            },
          }
        : null,
    [
      identity.data,
      overview.data?.servers,
      revision,
      refresh,
      navigate,
      notify,
    ],
  );
  if (route === "/install")
    return (
      <InstallPage
        onBack={() => navigate("/overview")}
        connected={!demo && identity.data?.user.role === "admin"}
      />
    );
  if (route === "/settings" && !identity.data)
    return <SettingsPage onBack={() => navigate("/overview")} />;
  if (identity.loading)
    return (
      <div className="boot">
        <Logo />
        <Loading />
      </div>
    );
  if (!identity.data) {
    if (identity.error instanceof ApiError && identity.error.status === 401)
      return <Login onLogin={() => void identity.refresh()} />;
    return (
      <div className="boot">
        <Logo />
        <ErrorBox
          error={identity.error || "The panel is unavailable"}
          retry={() => void identity.refresh()}
        />
        <a href="/demo">{t("Explore the offline demo")}</a>
      </div>
    );
  }
  if (!workspace) return null;
  const page = route.split("/")[1] || "overview";
  const selectedServer = overview.data?.servers.find(
    (s) => s.id === route.split("/")[2],
  );
  const title =
    [...mainLinks, ...workspaceLinks].find((link) => link[0] === page)?.[1] ||
    "Workspace";
  const online =
    overview.data?.servers.filter((s) => s.snapshot.state === "online")
      .length || 0;
  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            href="#/overview"
            className="brand-link"
            aria-label={t("Emberdeck overview")}
          >
            <Logo />
          </a>
          <div className="workspace-switch">
            <span className="workspace-icon">
              <Box size={17} />
            </span>
            <div>
              <strong>{t("My workspace")}</strong>
              <span>{t(demo ? "Demo environment" : "Personal workspace")}</span>
            </div>
            <ChevronRight size={14} />
          </div>
          <div className="nav-section-label">{t("CONTROL ROOM")}</div>
          <NavigationGroup
            links={mainLinks}
            page={page}
            count={workspace.servers.length}
            label="CONTROL ROOM"
          />
          <div className="nav-section-label second">{t("WORKSPACE")}</div>
          <NavigationGroup
            links={workspaceLinks.filter(
              ([id]) =>
                workspace.can("admin") ||
                id === "activity" ||
                id === "settings",
            )}
            page={page}
            count={workspace.servers.length}
            label="WORKSPACE"
          />
          <div className="sidebar-bottom">
            <button
              className="ember-nav"
              onClick={() => {
                workspace.assistant(selectedServer?.id);
              }}
            >
              <Sparkles size={17} />
              <span>{t("Ask Ember")}</span>
              <span className="tag">AI</span>
            </button>
            <a
              className="docs-link"
              href="https://github.com/HVHBIGNAME/emberdeck/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              {t("Documentation")}
              <ArrowUpRight size={13} />
            </a>
            <div className="sidebar-version">
              <span className="dot green" />v{identity.data.version}
              <span>{t("RUST NATIVE")}</span>
            </div>
            <WorkspaceProfile />
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <Box size={15} />
              <span>{t("My workspace")}</span>
              <ChevronRight size={13} />
              <strong>{selectedServer?.name || t(title)}</strong>
            </div>
            <div className="topbar-right">
              <span className="connection-state">
                <span className="dot green" />
                {t("{{count}} servers online", { count: online })}
              </span>
              <button
                className="global-search"
                aria-label={t("Find a server…")}
                onClick={() => {
                  setSearch("");
                  setShowSearch(true);
                }}
              >
                <Search size={15} />
                <span>{t("Find a server…")}</span>
                <kbd>
                  <Command size={10} /> K
                </kbd>
              </button>
              <button
                className="icon-button mobile-assistant"
                aria-label={t("Ask Ember")}
                onClick={() => workspace.assistant(selectedServer?.id)}
              >
                <Sparkles size={20} />
              </button>
              <button
                className="icon-button topbar-preferences"
                aria-label={t("Personal preferences")}
                onClick={() => navigate("/settings")}
              >
                <SlidersHorizontal size={18} />
              </button>
              {workspace.can("admin") && (
                <Button
                  variant="primary"
                  className="topbar-create"
                  aria-label={t("New server")}
                  onClick={() => workspace.newServer()}
                >
                  <Plus size={16} />
                  <span>{t("New server")}</span>
                </Button>
              )}
            </div>
          </header>
          <main className="main-content">
            <ErrorBox
              error={overview.error}
              retry={() => void overview.refresh()}
            />
            {overview.loading && !overview.data ? (
              <Loading />
            ) : (
              <AnimatePresence mode="wait">
                <PageTransition
                  key={
                    page === "servers"
                      ? route.split("/").slice(0, 3).join("/")
                      : route
                  }
                >
                  {page === "overview" && overview.data && (
                    <Dashboard overview={overview.data} />
                  )}
                  {page === "servers" && route.split("/")[2] && (
                    <ServerPage id={route.split("/")[2]} />
                  )}
                  {page === "servers" && !route.split("/")[2] && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">
                            {t("A HOME FOR EVERY ADVENTURE")}
                          </span>
                          <h1>
                            {t("Your servers")}
                            <span className="orange-text">.</span>
                          </h1>
                          <p>{t("Pick a world and make yourself at home.")}</p>
                        </div>
                      </div>
                      <div className="server-grid">
                        {workspace.servers.map((server) => (
                          <ServerCard key={server.id} server={server} />
                        ))}
                      </div>
                      {!workspace.servers.length && (
                        <Button onClick={() => workspace.newServer()}>
                          {t("Create your first server")}
                        </Button>
                      )}
                    </>
                  )}
                  {page === "library" && <LibraryPage />}
                  {page === "blueprints" && <BlueprintsPage />}
                  {page === "automations" && <AutomationsPage />}
                  {page === "backups" && <BackupsPage />}
                  {page === "nodes" && <NodesPage />}
                  {page === "access" && <AccessPage />}
                  {page === "settings" && <SettingsPage />}
                  {page === "activity" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">
                            {t("NOTHING LOST IN THE LOGS")}
                          </span>
                          <h1>
                            {t("Workspace activity")}
                            <span className="orange-text">.</span>
                          </h1>
                          <p>
                            {t("An audit trail of the things that matter.")}
                          </p>
                        </div>
                      </div>
                      <section className="panel">
                        <ActivityList
                          activity={overview.data?.activity || []}
                        />
                      </section>
                    </>
                  )}
                  {![
                    "overview",
                    "servers",
                    "library",
                    "blueprints",
                    "automations",
                    "backups",
                    "nodes",
                    "access",
                    "activity",
                    "settings",
                  ].includes(page) && (
                    <ErrorBox error="This page does not exist." />
                  )}
                </PageTransition>
              </AnimatePresence>
            )}
            <footer className="page-footer">
              <span>
                <span className="tiny-mark">✦</span>{" "}
                {t("A good place for your next world.")}
              </span>
              <span>
                {t(
                  demo
                    ? "DEMO WORKSPACE · SAMPLE DATA"
                    : "SELF-HOSTED · OPEN SOURCE",
                )}
              </span>
            </footer>
          </main>
        </div>
        <MobileNavigation page={page} route={route} />
        <AnimatePresence>
          {newTemplate && (
            <NewServer
              key="new-server"
              initialTemplate={newTemplate}
              initialModpack={newModpack}
              initialVersion={newVersion}
              onClose={() => setNewTemplate(null)}
            />
          )}
          {assistantServer !== null && (
            <Assistant
              key="assistant"
              initialServer={assistantServer}
              configured={identity.data.assistant_configured}
              onClose={() => setAssistantServer(null)}
            />
          )}
          {showSearch && (
            <Modal
              key="search"
              title="Find your world"
              subtitle={t("Jump straight to a server.")}
              initialFocus="input"
              onClose={() => setShowSearch(false)}
            >
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label={t("Search servers")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Name, core, or Minecraft version…")}
                />
              </div>
              <div className="search-results">
                {workspace.servers
                  .filter((s) =>
                    `${s.name} ${s.template} ${s.version}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        navigate(`/servers/${s.id}`);
                        setShowSearch(false);
                      }}
                    >
                      <Server size={18} />
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          {s.template} · {s.version}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
            </Modal>
          )}
          {jobServer && (
            <JobDock
              key="jobs"
              serverId={jobServer}
              onClose={() => setJobServer(null)}
            />
          )}
          {toast && (
            <motion.div
              key="toast"
              style={{ x: "-50%" }}
              initial={animated ? { opacity: 0, y: 16, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: animated ? 8 : 0 }}
              transition={{ duration: animated ? 0.22 : 0 }}
              className={`toast ${toast.error ? "error" : ""}`}
              role={toast.error ? "alert" : "status"}
            >
              {toast.error ? <X size={16} /> : <Check size={16} />}
              <span>{messageText(toast.message)}</span>
              <button
                className="icon-button"
                onClick={() => setToast(null)}
                aria-label={t("Dismiss notification")}
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </WorkspaceContext.Provider>
  );
}
