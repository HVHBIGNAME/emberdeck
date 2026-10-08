import { useState } from "react";
import {
  ArrowUpRight,
  Box,
  Check,
  Cpu,
  HardDrive,
  KeyRound,
  Network,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api, post, useApi } from "./api";
import { useWorkspace } from "./context";
import type { AccessToken, Node, Template } from "./types";
import {
  Badge,
  Button,
  CopyButton,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  Select,
  AnimatePresence,
  bytes,
  date,
} from "./ui";
import { useTranslation } from "./i18n";
import { motion } from "motion/react";
import { usePreferences } from "./Preferences";
import { sceneArt, serverArt } from "./scene-art";
import { SegmentedControl } from "./SegmentedControl";

export function BlueprintsPage() {
  const { t: tr } = useTranslation();
  const { motion: animated } = usePreferences();
  const { newServer, can } = useWorkspace();
  const [family, setFamily] = useState("all");
  const templates = useApi<{ templates: Template[] }>("/api/templates");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("THE RIGHT FOUNDATION")}</span>
          <h1>
            {tr("Built for your kind of world")}
            <span className="orange-text">.</span>
          </h1>
          <p>
            {tr(
              "Native blueprints. Reproducible installs. A core for every idea.",
            )}
          </p>
        </div>
        <span className="tag">{tr("9 CORE BLUEPRINTS")}</span>
      </div>
      <div className="toolbar">
        <SegmentedControl
          label={tr("Blueprint type")}
          value={family}
          onChange={setFamily}
          options={[
            ["all", "All blueprints"],
            ["plugins", "Plugins"],
            ["mods", "Mods"],
            ["hybrid", "Mods + plugins"],
            ["vanilla", "Vanilla"],
          ].map(([value, label]) => ({ value, label: tr(label) }))}
        />
      </div>
      <ErrorBox error={templates.error} />
      {templates.loading ? (
        <Loading />
      ) : (
        <div className="blueprint-grid">
          <AnimatePresence>
            {templates.data?.templates
              .filter((t) => family === "all" || t.family === family)
              .map((t) => (
                <motion.article
                  key={t.id}
                  className={`blueprint-card blueprint-library-card ${t.family}`}
                  layout={animated ? "position" : false}
                  initial={animated ? { opacity: 0, y: 16 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: animated ? 0.22 : 0 }}
                >
                  <button
                    type="button"
                    className="card-hitarea"
                    data-cursor-target="parent"
                    disabled={!can("admin")}
                    aria-label={tr("Create with {{name}}", { name: t.name })}
                    onClick={() => newServer(t.id)}
                  />
                  <div className="blueprint-cover" aria-hidden="true">
                    <img
                      src={sceneArt(
                        serverArt({ id: t.id, template: t.id }),
                        true,
                      )}
                      alt=""
                      loading="lazy"
                    />
                    <div />
                  </div>
                  <div className="blueprint-content">
                    <span className="blueprint-icon">{t.name[0]}</span>
                    <h3>{t.name}</h3>
                    <p>{tr(t.description)}</p>
                    <span className="tag">
                      {tr(
                        t.experimental
                          ? "Experimental"
                          : t.family === "plugins"
                            ? "Plugin support"
                            : t.family === "mods"
                              ? "Mod support"
                              : "Official server",
                      )}
                    </span>
                    <div className="blueprint-launch">
                      {tr("Create with {{name}}", { name: t.name })}
                      <ArrowUpRight size={14} />
                    </div>
                  </div>
                </motion.article>
              ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

export function NodesPage() {
  const { t } = useTranslation();
  const { can, notify, refresh, revision } = useWorkspace();
  const [open, setOpen] = useState(false);
  const nodes = useApi<{ nodes: Node[] }>(
    can("admin") ? "/api/nodes" : null,
    15000,
    revision,
  );
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(2022);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  if (!can("admin"))
    return (
      <ErrorBox error="Node management requires an administrator token." />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("A PLACE FOR YOUR WORLDS")}</span>
          <h1>
            {t("Your infrastructure")}
            <span className="orange-text">.</span>
          </h1>
          <p>
            {t("Connect Linux agents. Keep the control plane in one place.")}
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} />
          {t("Connect node")}
        </Button>
      </div>
      <ErrorBox error={nodes.error} />
      {nodes.loading ? (
        <Loading />
      ) : (
        <div className="node-grid">
          {nodes.data?.nodes.map((node) => (
            <article className="panel node-card" key={node.id}>
              <h2>
                <Network size={19} />
                {node.name}
              </h2>
              <p className="node-meta">
                {node.info?.os || t("Awaiting node information")} ·{" "}
                {node.info?.architecture || "—"}
              </p>
              <div className="node-resources">
                <div>
                  <Cpu size={16} />
                  <strong> {node.info?.cpu_cores || "—"}</strong>
                  <span>{t("CPU cores")}</span>
                </div>
                <div>
                  <HardDrive size={16} />
                  <strong>
                    {" "}
                    {node.info ? bytes(node.info.memory_bytes, 0) : "—"}
                  </strong>
                  <span>{t("Total memory")}</span>
                </div>
              </div>
              <div className="credential">
                <span>{t("Agent URL")}</span>
                <code>{node.url}</code>
              </div>
              <div className="credential">
                <span>SFTP</span>
                <code>
                  {node.public_host}:{node.sftp_port}
                </code>
                <CopyButton value={`${node.public_host}:${node.sftp_port}`} />
              </div>
              <footer>
                <span>Docker {node.info?.docker_version || "—"}</span>
                <Badge state={node.info ? "online" : "unreachable"} />
              </footer>
            </article>
          ))}
        </div>
      )}
      {!nodes.loading && !nodes.data?.nodes.length && (
        <Empty
          icon={<Network />}
          title="Connect your first node"
          description="Install the Emberdeck agent on a Linux machine, then enter its URL and management token."
        />
      )}
      <AnimatePresence>
        {open && (
          <Modal
            title="Connect a Linux node"
            subtitle={t(
              "The agent token is kept on the control plane, never in the browser.",
            )}
            onClose={() => setOpen(false)}
          >
            <form
              className="form-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError(null);
                try {
                  await post("/api/nodes", {
                    name,
                    url,
                    token,
                    public_host: host,
                    sftp_port: port,
                  });
                  setToken("");
                  setOpen(false);
                  refresh();
                  notify("Node connected.");
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error
                      : new Error("Connection failed"),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {t("Node name")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="eu-central-02"
                  required
                />
              </label>
              <label>
                {t("Agent URL")}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://node.example.com"
                  required
                />
                <small>
                  {t(
                    "Remote agents require HTTPS. Loopback SSH tunnels may use HTTP.",
                  )}
                </small>
              </label>
              <label>
                {t("Agent management token")}
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ed_…"
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  {t("Public game hostname")}
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="play.example.com"
                    required
                  />
                </label>
                <label>
                  {t("SFTP port")}
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    min={1}
                    max={65535}
                    required
                  />
                </label>
              </div>
              <ErrorBox error={error} />
              <div className="modal-actions">
                <Button onClick={() => setOpen(false)} type="button">
                  {t("Cancel")}
                </Button>
                <Button variant="primary" busy={busy} type="submit">
                  <Network size={15} />
                  {t("Connect node")}
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

export function AccessPage() {
  const { t } = useTranslation();
  const { can, servers, revision, refresh, notify } = useWorkspace();
  const tokens = useApi<{ tokens: AccessToken[] }>(
    can("admin") ? "/api/tokens" : null,
    0,
    revision,
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [scope, setScope] = useState("*");
  const [days, setDays] = useState("30");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [revoke, setRevoke] = useState<AccessToken | null>(null);
  if (!can("admin"))
    return (
      <ErrorBox error="Token management requires an administrator token." />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("TRUST, WITH BOUNDARIES")}</span>
          <h1>
            {t("The right keys. The right people")}
            <span className="orange-text">.</span>
          </h1>
          <p>{t("Scoped access for your team, automations, and CLI.")}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setOpen(true);
            setSecret("");
            setError(null);
          }}
        >
          <Plus size={15} />
          {t("Create token")}
        </Button>
      </div>
      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          {t(
            "Admin manages the workspace. Operator manages assigned servers. Viewer has read-only access. Tokens are stored as hashes; browser sessions use HttpOnly cookies.",
          )}
        </span>
      </div>
      <div style={{ height: 21 }} />
      <ErrorBox error={tokens.error} />
      {tokens.loading ? (
        <Loading />
      ) : tokens.data?.tokens.length ? (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Token")}</th>
                <th>{t("Role")}</th>
                <th>{t("Server scope")}</th>
                <th>{t("Expires")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {tokens.data.tokens.map((token) => (
                <tr key={token.id}>
                  <td>
                    <span className="file-name">
                      <KeyRound size={16} />
                      <strong>{token.name}</strong>
                    </span>
                    <small>
                      {t("Created {{date}}", { date: date(token.created_at) })}
                    </small>
                  </td>
                  <td>
                    <span className="tag">{t(token.role)}</span>
                  </td>
                  <td>
                    {token.server_ids
                      .map((id) =>
                        id === "*"
                          ? t("All servers")
                          : servers.find((s) => s.id === id)?.name || id,
                      )
                      .join(", ")}
                  </td>
                  <td>
                    {token.expires_at
                      ? date(token.expires_at)
                      : t("No expiration")}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={t("Revoke {{name}}", { name: token.name })}
                      onClick={() => setRevoke(token)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<KeyRound />}
          title="Keep a key for everyone who needs one"
          description="Create scoped tokens for teammates. Your owner credential is managed in the server configuration."
        />
      )}
      <AnimatePresence>
        {open && (
          <Modal
            key="create-token"
            title={
              secret ? "A key to your workspace." : "Create an access token"
            }
            subtitle={t(
              secret
                ? "Copy it now. This token cannot be shown again."
                : "Give access to exactly what is needed.",
            )}
            onClose={() => {
              setOpen(false);
              setSecret("");
            }}
          >
            {secret ? (
              <>
                <div className="token-secret">
                  <code>{secret}</code>
                  <CopyButton value={secret} label="Copy new token" />
                </div>
                <div className="modal-actions">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setOpen(false);
                      setSecret("");
                    }}
                  >
                    <Check size={15} />
                    {t("I've saved it")}
                  </Button>
                </div>
              </>
            ) : (
              <form
                className="form-stack"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setError(null);
                  try {
                    const result = await post<{ token: string }>(
                      "/api/tokens",
                      {
                        name,
                        role,
                        server_ids: [scope],
                        expires_at: days
                          ? Math.floor(Date.now() / 1000) + Number(days) * 86400
                          : null,
                      },
                    );
                    setSecret(result.token);
                    refresh();
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error
                        : new Error("Could not create token"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  {t("Token name")}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("Community moderators")}
                    required
                    maxLength={80}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    {t("Role")}
                    <Select
                      label={t("Role")}
                      value={role}
                      onValueChange={setRole}
                      options={[
                        { value: "viewer", label: t("Viewer · read only") },
                        {
                          value: "operator",
                          label: t("Operator · manage servers"),
                        },
                        {
                          value: "admin",
                          label: t("Admin · entire workspace"),
                        },
                      ]}
                    />
                  </label>
                  <label>
                    {t("Server scope")}
                    <Select
                      label={t("Server scope")}
                      value={scope}
                      onValueChange={setScope}
                      options={[
                        { value: "*", label: t("All servers") },
                        ...servers.map((server) => ({
                          value: server.id,
                          label: server.name,
                        })),
                      ]}
                    />
                  </label>
                </div>
                <label>
                  {t("Expires after")}
                  <Select
                    label={t("Expires after")}
                    value={days}
                    onValueChange={setDays}
                    options={[
                      { value: "7", label: t("7 days") },
                      { value: "30", label: t("30 days") },
                      { value: "90", label: t("90 days") },
                      { value: "", label: t("No expiration") },
                    ]}
                  />
                </label>
                <ErrorBox error={error} />
                <div className="modal-actions">
                  <Button type="button" onClick={() => setOpen(false)}>
                    {t("Cancel")}
                  </Button>
                  <Button variant="primary" type="submit" busy={busy}>
                    <KeyRound size={15} />
                    {t("Create token")}
                  </Button>
                </div>
              </form>
            )}
          </Modal>
        )}
        {revoke && (
          <Modal
            key="revoke-token"
            title={t("Revoke “{{name}}”?", { name: revoke.name })}
            subtitle={t(
              "API access and its browser sessions will stop working immediately.",
            )}
            onClose={() => setRevoke(null)}
          >
            <div className="notice orange">
              <Box size={16} />
              {t(
                "Previously issued SFTP credentials expire independently, within 24 hours.",
              )}
            </div>
            <div className="modal-actions">
              <Button onClick={() => setRevoke(null)}>{t("Keep token")}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api(`/api/tokens/${revoke.id}`, { method: "DELETE" });
                    refresh();
                    setRevoke(null);
                    notify("Token revoked.");
                  } catch (error) {
                    notify(String(error), true);
                  }
                }}
              >
                {t("Revoke token")}
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
