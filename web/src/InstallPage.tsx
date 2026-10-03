import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Download,
  Globe,
  LockKeyhole,
  Network,
  Terminal,
} from "lucide-react";
import { useApi } from "./api";
import { Button, CopyButton, ErrorBox, Logo } from "./ui";
import {
  accessProfiles,
  initialInstall,
  installationCommand,
  installationError,
  needsHostname,
  releaseTag,
  repository,
  type AccessMode,
  type InstallDraft,
  type UpdateDraft,
} from "./installation";
import "./install.css";

interface Deployment {
  mode: AccessMode;
  origin: string;
  public_url: string | null;
  ephemeral: boolean;
  secure_cookies: boolean;
  version: string;
}

export function InstallPage({
  onBack,
  connected,
}: {
  onBack: () => void;
  connected: boolean;
}) {
  const [draft, setDraft] = useState<InstallDraft>(initialInstall);
  const update: UpdateDraft = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const error = installationError(draft);
  const command = installationCommand(draft);
  return (
    <main className="install-screen">
      <header className="install-header">
        <Logo />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to workspace
        </Button>
      </header>
      <div className="install-heading">
        <span className="eyebrow">A SHORTER WAY TO YOUR FIRST WORLD</span>
        <h1>
          One command. Your choice<span className="orange-text">.</span>
        </h1>
        <p>
          Choose how to connect. The native installer handles the services,
          credentials and access setup.
        </p>
        <div className="install-badges">
          <span className="tag">{releaseTag}</span>
          <span className="tag">RUST NATIVE</span>
          <span className="tag">UBUNTU / DEBIAN · SYSTEMD</span>
        </div>
      </div>
      {connected && <CurrentDeployment />}
      <div className="install-layout">
        <section className="panel install-options">
          <InstallOptions draft={draft} update={update} />
        </section>
        <aside className="install-preview">
          <CommandPreview draft={draft} command={command} error={error} />
          <section className="panel install-downloads">
            <h2>
              <Download size={17} />
              Prefer a native download?
            </h2>
            <p>
              Linux binaries include the game node. Windows runs the panel, demo
              and CLI with a Linux node.
            </p>
            <a
              href={`${repository}/releases/tag/${releaseTag}`}
              target="_blank"
              rel="noreferrer"
            >
              Linux amd64 / arm64 and Windows amd64
              <ArrowUpRight size={15} />
            </a>
          </section>
        </aside>
      </div>
      <footer className="install-footer">
        <span>Self-hosted. Open source. Yours.</span>
        <a
          href={`${repository}/blob/main/docs/installation-profiles.md`}
          target="_blank"
          rel="noreferrer"
        >
          Installation guide
          <ArrowUpRight size={13} />
        </a>
      </footer>
    </main>
  );
}

function CurrentDeployment() {
  const deployment = useApi<Deployment>("/api/deployment", 15000);
  return (
    <section className="panel install-current">
      <Network size={19} className="orange-text" />
      <div>
        <strong>This workspace</strong>
        <p>
          {deployment.data
            ? `${accessProfiles.find((profile) => profile.id === deployment.data?.mode)?.name} · v${deployment.data.version}`
            : "Reading access configuration…"}
        </p>
      </div>
      {deployment.data && (
        <div className="install-current-address">
          <code>
            {deployment.data.public_url || "Waiting for a tunnel URL"}
          </code>
          {deployment.data.public_url && (
            <CopyButton
              value={deployment.data.public_url}
              label="Copy current panel URL"
            />
          )}
          <small>Origin: {deployment.data.origin}</small>
        </div>
      )}
      <ErrorBox
        error={deployment.error}
        retry={() => void deployment.refresh()}
      />
    </section>
  );
}

function InstallOptions({
  draft,
  update,
}: {
  draft: InstallDraft;
  update: UpdateDraft;
}) {
  return (
    <div className="form-stack">
      <div className="install-step">
        <span>01</span>
        <div>
          <h2>What belongs on this machine?</h2>
          <p>A complete workspace, or another piece of your infrastructure.</p>
        </div>
      </div>
      <label>
        Components
        <select
          aria-label="Components"
          value={draft.role}
          onChange={(event) =>
            update(
              "role",
              event.target.value === "panel"
                ? "panel"
                : event.target.value === "agent"
                  ? "agent"
                  : "all",
            )
          }
        >
          <option value="all">All-in-one · panel + Minecraft node</option>
          <option value="panel">
            Control panel only · connect remote nodes
          </option>
          <option value="agent">
            Minecraft node only · connect to a panel
          </option>
        </select>
      </label>
      {draft.role !== "agent" ? (
        <>
          <div className="install-step">
            <span>02</span>
            <div>
              <h2>Choose your way in.</h2>
              <p>Outbound tunnels work without inbound web ports.</p>
            </div>
          </div>
          <ProfileChoices
            access={draft.access}
            select={(access) => update("access", access)}
          />
          {needsHostname(draft.access) && (
            <label>
              Public HTTPS URL
              <input
                type="url"
                value={draft.publicUrl}
                onChange={(event) => update("publicUrl", event.target.value)}
                placeholder="https://panel.example.com"
                maxLength={512}
              />
            </label>
          )}
          {draft.access === "cloudflare" && (
            <>
              <div className="notice">
                <Cloud size={17} />
                <span>
                  In Cloudflare, create a remotely managed tunnel and route your
                  hostname to <code>http://127.0.0.1:{draft.panelPort}</code>.
                  The installer asks for its connector token in the terminal.
                </span>
              </div>
              <label>
                Connector token file (optional)
                <input
                  value={draft.tokenFile}
                  onChange={(event) => update("tokenFile", event.target.value)}
                  placeholder="/root/cloudflared-token"
                  maxLength={512}
                />
                <small>
                  Leave empty for a hidden terminal prompt. The connector token
                  is stored privately on the host.
                </small>
              </label>
            </>
          )}
          {draft.access === "proxy" && (
            <div className="notice">
              <Globe size={17} />
              <span>
                Configure your existing proxy to forward this hostname to{" "}
                <code>http://127.0.0.1:{draft.panelPort}</code> and preserve the
                Host header. The installer verifies the public endpoint.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="notice">
          <Network size={17} />
          <span>
            The node installs Docker and a scoped SFTP service. Register its
            management endpoint and token in your existing panel's Nodes page.
          </span>
        </div>
      )}
      <details className="install-advanced">
        <summary>Ports &amp; game connection address</summary>
        <AdvancedFields draft={draft} update={update} />
      </details>
      <p className="install-boundary">
        Web tunnels carry the panel and API. Minecraft and SFTP use the node's
        own addresses and their respective ports.
      </p>
    </div>
  );
}

function ProfileChoices({
  access,
  select,
}: {
  access: AccessMode;
  select: (access: AccessMode) => void;
}) {
  return (
    <fieldset className="install-profiles">
      <legend className="sr-only">Web access method</legend>
      {accessProfiles.map((profile) => (
        <label
          className={`install-profile ${access === profile.id ? "selected" : ""}`}
          key={profile.id}
        >
          <span className="install-profile-heading">
            <strong>{profile.name}</strong>
            <input
              type="radio"
              name="access-profile"
              value={profile.id}
              checked={access === profile.id}
              onChange={() => select(profile.id)}
            />
          </span>
          <span className="tag">{profile.badge}</span>
          <span className="install-profile-description">
            {profile.description}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function AdvancedFields({
  draft,
  update,
}: {
  draft: InstallDraft;
  update: UpdateDraft;
}) {
  return (
    <div className="form-stack">
      <label>
        Game hostname or IP (optional)
        <input
          value={draft.publicHost}
          onChange={(event) => update("publicHost", event.target.value)}
          placeholder="play.example.com · auto-detect when empty"
          maxLength={253}
        />
      </label>
      <div className="install-ports">
        {(
          [
            ["panelPort", "Panel port"],
            ["agentPort", "Agent port"],
            ["sftpPort", "SFTP port"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={1024}
              max={65535}
              value={draft[key]}
              onChange={(event) => update(key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      <small>
        These ports apply to fresh installations. Upgrades preserve existing
        ports and credentials; use the current origin shown above when
        configuring an existing tunnel.
      </small>
    </div>
  );
}

function CommandPreview({
  draft,
  command,
  error,
}: {
  draft: InstallDraft;
  command: string;
  error: string | null;
}) {
  return (
    <section className="panel install-command-card">
      <div className="install-step">
        <span>03</span>
        <div>
          <h2>Make it yours.</h2>
          <p>Run this command on your Linux host through SSH.</p>
        </div>
      </div>
      <div className="install-command-heading">
        <Terminal size={15} />
        <span>ROOT / SUDO TERMINAL</span>
      </div>
      {command ? (
        <pre className="install-command" aria-label="Installation command">
          <code>{command}</code>
        </pre>
      ) : (
        <div className="install-command-placeholder">
          Complete the settings to generate your command.
        </div>
      )}
      <ErrorBox error={error} />
      {command && (
        <CopyButton value={command} label="Copy install command" showLabel />
      )}
      <ol className="install-checklist">
        <li>
          <CheckCircle2 size={15} />
          <span>Download a checksum-verified native binary.</span>
        </li>
        <li>
          <CheckCircle2 size={15} />
          <span>
            Install the selected systemd services and required dependencies.
          </span>
        </li>
        <li>
          <CheckCircle2 size={15} />
          <span>
            {draft.role === "agent"
              ? "Connect the node to your existing panel."
              : "Verify the endpoint and print the panel address."}
          </span>
        </li>
      </ol>
      {draft.role !== "agent" && (
        <div className="install-signin">
          <LockKeyhole size={16} />
          <div>
            <strong>Your first sign-in</strong>
            <p>
              Open the printed URL. Retrieve the owner access token in the same
              SSH session:
            </p>
            <code>sudo cat /etc/emberdeck/owner-token</code>
          </div>
        </div>
      )}
      {draft.role !== "agent" && draft.access === "quick" && (
        <p className="install-boundary">
          Quick URLs are temporary and change after a tunnel restart. A
          Cloudflare connector token gives your workspace a stable address.
        </p>
      )}
      {draft.role !== "agent" && draft.access === "local" && (
        <div className="install-signin">
          <Terminal size={16} />
          <div>
            <strong>SSH forwarding</strong>
            <code>
              ssh -L {draft.panelPort}:127.0.0.1:{draft.panelPort}{" "}
              root@your-server
            </code>
          </div>
        </div>
      )}
    </section>
  );
}
