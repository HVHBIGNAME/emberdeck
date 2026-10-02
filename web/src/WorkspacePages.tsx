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
  bytes,
  date,
} from "./ui";

export function BlueprintsPage() {
  const { newServer, can } = useWorkspace();
  const [family, setFamily] = useState("all");
  const templates = useApi<{ templates: Template[] }>("/api/templates");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE RIGHT FOUNDATION</span>
          <h1>
            Built for your kind of world<span className="orange-text">.</span>
          </h1>
          <p>
            Native blueprints. Reproducible installs. A core for every idea.
          </p>
        </div>
        <span className="tag">9 CORE BLUEPRINTS</span>
      </div>
      <div className="toolbar">
        <div className="segment">
          {[
            ["all", "All blueprints"],
            ["plugins", "Plugins"],
            ["mods", "Mods"],
            ["hybrid", "Mods + plugins"],
            ["vanilla", "Vanilla"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={family === value ? "active" : ""}
              onClick={() => setFamily(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox error={templates.error} />
      {templates.loading ? (
        <Loading />
      ) : (
        <div className="blueprint-grid">
          {templates.data?.templates
            .filter((t) => family === "all" || t.family === family)
            .map((t) => (
              <article key={t.id} className={`blueprint-card ${t.family}`}>
                <span className="blueprint-icon">{t.name[0]}</span>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
                <span className="tag">
                  {t.experimental
                    ? "Experimental"
                    : t.family === "plugins"
                      ? "Plugin support"
                      : t.family === "mods"
                        ? "Mod support"
                        : "Official server"}
                </span>
                <hr />
                <Button
                  variant="ghost"
                  disabled={!can("admin")}
                  onClick={() => newServer(t.id)}
                >
                  Create with {t.name}
                  <ArrowUpRight size={14} />
                </Button>
              </article>
            ))}
        </div>
      )}
    </>
  );
}

export function NodesPage() {
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
          <span className="eyebrow">A PLACE FOR YOUR WORLDS</span>
          <h1>
            Your infrastructure<span className="orange-text">.</span>
          </h1>
          <p>Connect Linux agents. Keep the control plane in one place.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} />
          Connect node
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
                {node.info?.os || "Awaiting node information"} ·{" "}
                {node.info?.architecture || "—"}
              </p>
              <div className="node-resources">
                <div>
                  <Cpu size={16} />
                  <strong> {node.info?.cpu_cores || "—"}</strong>
                  <span>CPU cores</span>
                </div>
                <div>
                  <HardDrive size={16} />
                  <strong>
                    {" "}
                    {node.info ? bytes(node.info.memory_bytes, 0) : "—"}
                  </strong>
                  <span>Total memory</span>
                </div>
              </div>
              <div className="credential">
                <span>Agent URL</span>
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
      {open && (
        <Modal
          title="Connect a Linux node"
          subtitle="The agent token is kept on the control plane, never in the browser."
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
              Node name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="eu-central-02"
                required
              />
            </label>
            <label>
              Agent URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://node.example.com"
                required
              />
              <small>
                Remote agents require HTTPS. Loopback SSH tunnels may use HTTP.
              </small>
            </label>
            <label>
              Agent management token
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
                Public game hostname
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="play.example.com"
                  required
                />
              </label>
              <label>
                SFTP port
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
                Cancel
              </Button>
              <Button variant="primary" busy={busy} type="submit">
                <Network size={15} />
                Connect node
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function AccessPage() {
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
          <span className="eyebrow">TRUST, WITH BOUNDARIES</span>
          <h1>
            The right keys. The right people
            <span className="orange-text">.</span>
          </h1>
          <p>Scoped access for your team, automations, and CLI.</p>
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
          Create token
        </Button>
      </div>
      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          <strong>Admin</strong> manages the workspace.{" "}
          <strong>Operator</strong> manages assigned servers.{" "}
          <strong>Viewer</strong> has read-only access. Tokens are stored as
          hashes; browser sessions use HttpOnly cookies.
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
                <th>Token</th>
                <th>Role</th>
                <th>Server scope</th>
                <th>Expires</th>
                <th>Actions</th>
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
                    <small>Created {date(token.created_at)}</small>
                  </td>
                  <td>
                    <span className="tag">{token.role}</span>
                  </td>
                  <td>
                    {token.server_ids
                      .map((id) =>
                        id === "*"
                          ? "All servers"
                          : servers.find((s) => s.id === id)?.name || id,
                      )
                      .join(", ")}
                  </td>
                  <td>
                    {token.expires_at
                      ? date(token.expires_at)
                      : "No expiration"}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Revoke ${token.name}`}
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
      {open && (
        <Modal
          title={secret ? "A key to your workspace." : "Create an access token"}
          subtitle={
            secret
              ? "Copy it now. This token cannot be shown again."
              : "Give access to exactly what is needed."
          }
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
                  I've saved it
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
                  const result = await post<{ token: string }>("/api/tokens", {
                    name,
                    role,
                    server_ids: [scope],
                    expires_at: days
                      ? Math.floor(Date.now() / 1000) + Number(days) * 86400
                      : null,
                  });
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
                Token name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Community moderators"
                  required
                  maxLength={80}
                />
              </label>
              <div className="form-grid">
                <label>
                  Role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="viewer">Viewer · read only</option>
                    <option value="operator">Operator · manage servers</option>
                    <option value="admin">Admin · entire workspace</option>
                  </select>
                </label>
                <label>
                  Server scope
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="*">All servers</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Expires after
                <select value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="">No expiration</option>
                </select>
              </label>
              <ErrorBox error={error} />
              <div className="modal-actions">
                <Button type="button" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" busy={busy}>
                  <KeyRound size={15} />
                  Create token
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {revoke && (
        <Modal
          title={`Revoke “${revoke.name}”?`}
          subtitle="API access and its browser sessions will stop working immediately."
          onClose={() => setRevoke(null)}
        >
          <div className="notice orange">
            <Box size={16} />
            Previously issued SFTP credentials expire independently, within 24
            hours.
          </div>
          <div className="modal-actions">
            <Button onClick={() => setRevoke(null)}>Keep token</Button>
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
              Revoke token
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
