import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Command,
  ExternalLink,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Plus,
  Puzzle,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { ApiError, demo, hostedDemo, post, useApi } from "./api";
import { publicFile } from "./assets";
import type { Identity, Job, Overview } from "./types";
import { WorkspaceContext, type Workspace } from "./context";
import { Button, ErrorBox, Loading, Logo, Modal } from "./ui";
import Dashboard, { ActivityList, ServerCard } from "./dashboard";
import { NewServer } from "./NewServer";
import ServerPage from "./ServerPage";
import { AccessPage, BlueprintsPage, NodesPage } from "./WorkspacePages";
import { LibraryPage } from "./Library";
import { AutomationsPage, BackupsPage } from "./operations";
import { Assistant } from "./Assistant";

const mainLinks = [
  ["overview", "Overview", LayoutDashboard],
  ["servers", "Servers", Server],
  ["library", "Library", Puzzle],
  ["blueprints", "Blueprints", Box],
  ["automations", "Automations", Workflow],
  ["backups", "Backups", Archive],
] as const;
const workspaceLinks = [
  ["nodes", "Nodes", Network],
  ["access", "Access & tokens", ShieldCheck],
  ["activity", "Activity", Activity],
] as const;

function Login({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return (
    <div className="login-screen">
      <div className="login-art" aria-hidden="true">
        <div className="login-orbit">
          <img src={publicFile("worlds/overworld.svg")} alt="" />
          <span className="login-orbit-tag">
            <span className="dot green" /> YOUR NEXT WORLD AWAITS
          </span>
        </div>
      </div>
      <div className="login-content">
        <Logo />
        <span className="eyebrow">YOUR WORLDS. YOUR RULES.</span>
        <h1>
          Welcome home<span className="orange-text">.</span>
        </h1>
        <p>
          Your servers, your community, your next big idea.
          <br />
          It all starts here.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await post("/api/auth/login", { token });
              setToken("");
              onLogin();
            } catch (error) {
              setError(
                error instanceof Error ? error : new Error("Sign in failed"),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Access token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ed_…"
              autoComplete="current-password"
              required
            />
          </label>
          <ErrorBox error={error} />
          <Button variant="primary" busy={busy} type="submit">
            Enter your workspace <ArrowUpRight size={17} />
          </Button>
        </form>
        <p className="login-hint">
          Your owner token is in <code>/etc/emberdeck/owner-token</code>.
        </p>
        <a className="demo-link" href="/demo">
          Just looking around? Explore the demo <ArrowUpRight size={14} />
        </a>
        <footer>
          <span className="rust-badge">
            <Flame size={13} />
            Built with Rust
          </span>
          <span>Self-hosted. Open source. Yours.</span>
        </footer>
      </div>
    </div>
  );
}

function JobDock({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const jobs = useApi<{ jobs: Job[] }>(`/api/servers/${serverId}/jobs`, 2000);
  const active = jobs.data?.jobs.filter((j) => j.state === "running") || [];
  return (
    <aside className={`job-dock ${expanded ? "expanded" : ""}`}>
      <header>
        <button onClick={() => setExpanded(!expanded)}>
          <Activity size={15} /> Operations{" "}
          {active.length > 0 && (
            <span className="count-badge">{active.length}</span>
          )}
        </button>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close operations"
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
                  {job.kind.charAt(0).toUpperCase() + job.kind.slice(1)}
                </strong>
                <span>
                  {job.state === "completed" ? <Check size={14} /> : job.state}
                </span>
              </div>
              <p>{job.error || job.progress}</p>
              {job.result && (
                <details>
                  <summary>Result details</summary>
                  <pre>{JSON.stringify(job.result, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
          {!jobs.data?.jobs.length && (
            <p className="quiet">Waiting for the node…</p>
          )}
        </div>
      )}
    </aside>
  );
}

export default function App() {
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
  const [mobile, setMobile] = useState(false);
  const navigate = useCallback((path: string) => {
    window.location.hash = path;
    setMobile(false);
  }, []);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const listener = () =>
      setRoute(window.location.hash.slice(1) || "/overview");
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
        <a href="/demo">Explore the offline demo</a>
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
        <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
          <a
            href="#/overview"
            className="brand-link"
            aria-label="Emberdeck overview"
          >
            <Logo />
          </a>
          <div className="workspace-switch">
            <span className="workspace-icon">
              <Box size={17} />
            </span>
            <div>
              <strong>My workspace</strong>
              <span>{demo ? "Demo environment" : "Personal workspace"}</span>
            </div>
            <ChevronRight size={14} />
          </div>
          <div className="nav-section-label">CONTROL ROOM</div>
          <nav>
            {mainLinks.map(([id, label, Icon]) => (
              <a
                href={`#/${id}`}
                key={id}
                className={`nav-link ${page === id ? "active" : ""}`}
                onClick={() => setMobile(false)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {id === "servers" && (
                  <span className="nav-counter">
                    {overview.data?.servers.length || 0}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="nav-section-label second">WORKSPACE</div>
          <nav>
            {workspaceLinks
              .filter(([id]) => workspace.can("admin") || id === "activity")
              .map(([id, label, Icon]) => (
                <a
                  href={`#/${id}`}
                  key={id}
                  className={`nav-link ${page === id ? "active" : ""}`}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </a>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className="ember-nav"
              onClick={() => workspace.assistant(selectedServer?.id)}
            >
              <Sparkles size={17} />
              <span>Ask Ember</span>
              <span className="tag">AI</span>
            </button>
            <a
              className="docs-link"
              href="https://github.com/HVHBIGNAME/emberdeck/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              Documentation
              <ArrowUpRight size={13} />
            </a>
            <div className="sidebar-version">
              <span className="dot green" />v{identity.data.version}
              <span>RUST NATIVE</span>
            </div>
            <div className="profile">
              <span className="avatar">
                {identity.data.user.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{identity.data.user.name}</strong>
                <span>
                  {demo
                    ? "Read-only demo"
                    : `${identity.data.user.role} access`}
                </span>
              </div>
              {demo ? (
                <a
                  href={
                    hostedDemo ? "https://github.com/HVHBIGNAME/emberdeck" : "/"
                  }
                  className="icon-button"
                  aria-label="Leave demo"
                >
                  <LogOut size={16} />
                </a>
              ) : (
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={async () => {
                    try {
                      await post("/api/auth/logout", {});
                      window.location.assign("/");
                    } catch (error) {
                      notify(String(error), true);
                    }
                  }}
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-toggle"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <Box size={15} />
              <span>My workspace</span>
              <ChevronRight size={13} />
              <strong>{selectedServer?.name || title}</strong>
            </div>
            <div className="topbar-right">
              <span className="connection-state">
                <span className="dot green" />
                {online} server{online === 1 ? "" : "s"} online
              </span>
              <button
                className="global-search"
                onClick={() => {
                  setSearch("");
                  setShowSearch(true);
                }}
              >
                <Search size={15} />
                <span>Find a server…</span>
                <kbd>
                  <Command size={10} /> K
                </kbd>
              </button>
              {workspace.can("admin") && (
                <Button variant="primary" onClick={() => workspace.newServer()}>
                  <Plus size={16} />
                  <span>New server</span>
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
              <>
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
                          A HOME FOR EVERY ADVENTURE
                        </span>
                        <h1>
                          Your servers<span className="orange-text">.</span>
                        </h1>
                        <p>Pick a world and make yourself at home.</p>
                      </div>
                    </div>
                    <div className="server-grid">
                      {workspace.servers.map((server) => (
                        <ServerCard key={server.id} server={server} />
                      ))}
                    </div>
                    {!workspace.servers.length && (
                      <Button onClick={() => workspace.newServer()}>
                        Create your first server
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
                {page === "activity" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">
                          NOTHING LOST IN THE LOGS
                        </span>
                        <h1>
                          Workspace activity
                          <span className="orange-text">.</span>
                        </h1>
                        <p>An audit trail of the things that matter.</p>
                      </div>
                    </div>
                    <section className="panel">
                      <ActivityList activity={overview.data?.activity || []} />
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
                ].includes(page) && (
                  <ErrorBox error="This page does not exist." />
                )}
              </>
            )}
            <footer className="page-footer">
              <span>
                <span className="tiny-mark">✦</span> A good place for your next
                world.
              </span>
              <span>
                {demo
                  ? "DEMO WORKSPACE · SAMPLE DATA"
                  : "SELF-HOSTED · OPEN SOURCE"}
              </span>
            </footer>
          </main>
        </div>
        {newTemplate && (
          <NewServer
            initialTemplate={newTemplate}
            initialModpack={newModpack}
            initialVersion={newVersion}
            onClose={() => setNewTemplate(null)}
          />
        )}
        {assistantServer !== null && (
          <Assistant
            initialServer={assistantServer}
            configured={identity.data.assistant_configured}
            onClose={() => setAssistantServer(null)}
          />
        )}
        {showSearch && (
          <Modal
            title="Find your world"
            subtitle="Jump straight to a server."
            initialFocus="input"
            onClose={() => setShowSearch(false)}
          >
            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Search servers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, core, or Minecraft version…"
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
          <JobDock serverId={jobServer} onClose={() => setJobServer(null)} />
        )}
        {toast && (
          <div
            className={`toast ${toast.error ? "error" : ""}`}
            role={toast.error ? "alert" : "status"}
          >
            {toast.error ? <X size={16} /> : <Check size={16} />}
            <span>{toast.message}</span>
            <button
              className="icon-button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
