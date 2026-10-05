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
import { Button, CopyButton, ErrorBox, Logo, Select } from "./ui";
import { useTranslation } from "./i18n";
import { PageTransition } from "./Motion";
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
  const { t } = useTranslation();
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
          {t("Back to workspace")}
        </Button>
      </header>
      <PageTransition>
        <div className="install-heading">
          <span className="eyebrow">
            {t("A SHORTER WAY TO YOUR FIRST WORLD")}
          </span>
          <h1>
            {t("One command. Your choice")}
            <span className="orange-text">.</span>
          </h1>
          <p>
            {t(
              "Choose how to connect. The native installer handles the services, credentials and access setup.",
            )}
          </p>
          <div className="install-badges">
            <span className="tag">{releaseTag}</span>
            <span className="tag">{t("RUST NATIVE")}</span>
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
                {t("Prefer a native download?")}
              </h2>
              <p>
                {t(
                  "Linux binaries include the game node. Windows runs the panel, demo and CLI with a Linux node.",
                )}
              </p>
              <a
                href={`${repository}/releases/tag/${releaseTag}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("Linux amd64 / arm64 and Windows amd64")}
                <ArrowUpRight size={15} />
              </a>
            </section>
          </aside>
        </div>
      </PageTransition>
      <footer className="install-footer">
        <span>{t("Self-hosted. Open source. Yours.")}</span>
        <a
          href={`${repository}/blob/main/docs/installation-profiles.md`}
          target="_blank"
          rel="noreferrer"
        >
          {t("Installation guide")}
          <ArrowUpRight size={13} />
        </a>
      </footer>
    </main>
  );
}

function CurrentDeployment() {
  const { t } = useTranslation();
  const deployment = useApi<Deployment>("/api/deployment", 15000);
  return (
    <section className="panel install-current">
      <Network size={19} className="orange-text" />
      <div>
        <strong>{t("This workspace")}</strong>
        <p>
          {deployment.data
            ? `${t(accessProfiles.find((profile) => profile.id === deployment.data?.mode)?.name || deployment.data.mode)} · v${deployment.data.version}`
            : t("Reading access configuration…")}
        </p>
      </div>
      {deployment.data && (
        <div className="install-current-address">
          <code>
            {deployment.data.public_url || t("Waiting for a tunnel URL")}
          </code>
          {deployment.data.public_url && (
            <CopyButton
              value={deployment.data.public_url}
              label="Copy current panel URL"
            />
          )}
          <small>
            {t("Origin:")} {deployment.data.origin}
          </small>
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
  const { t } = useTranslation();
  return (
    <div className="form-stack">
      <div className="install-step">
        <span>01</span>
        <div>
          <h2>{t("What belongs on this machine?")}</h2>
          <p>
            {t(
              "A complete workspace, or another piece of your infrastructure.",
            )}
          </p>
        </div>
      </div>
      <label>
        {t("Components")}
        <Select
          label={t("Components")}
          value={draft.role}
          onValueChange={(value) =>
            update(
              "role",
              value === "panel" ? "panel" : value === "agent" ? "agent" : "all",
            )
          }
          options={[
            { value: "all", label: t("All-in-one · panel + Minecraft node") },
            {
              value: "panel",
              label: t("Control panel only · connect remote nodes"),
            },
            {
              value: "agent",
              label: t("Minecraft node only · connect to a panel"),
            },
          ]}
        />
      </label>
      {draft.role !== "agent" ? (
        <>
          <div className="install-step">
            <span>02</span>
            <div>
              <h2>{t("Choose your way in.")}</h2>
              <p>{t("Outbound tunnels work without inbound web ports.")}</p>
            </div>
          </div>
          <ProfileChoices
            access={draft.access}
            select={(access) => update("access", access)}
          />
          {needsHostname(draft.access) && (
            <label>
              {t("Public HTTPS URL")}
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
                  {t(
                    "In Cloudflare, create a remotely managed tunnel and route your hostname to",
                  )}{" "}
                  <code>http://127.0.0.1:{draft.panelPort}</code>.{" "}
                  {t(
                    "The installer asks for its connector token in the terminal.",
                  )}
                </span>
              </div>
              <label>
                {t("Connector token file (optional)")}
                <input
                  value={draft.tokenFile}
                  onChange={(event) => update("tokenFile", event.target.value)}
                  placeholder="/root/cloudflared-token"
                  maxLength={512}
                />
                <small>
                  {t(
                    "Leave empty for a hidden terminal prompt. The connector token is stored privately on the host.",
                  )}
                </small>
              </label>
            </>
          )}
          {draft.access === "proxy" && (
            <div className="notice">
              <Globe size={17} />
              <span>
                {t("Configure your existing proxy to forward this hostname to")}{" "}
                <code>http://127.0.0.1:{draft.panelPort}</code>{" "}
                {t(
                  "and preserve the Host header. The installer verifies the public endpoint.",
                )}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="notice">
          <Network size={17} />
          <span>
            {t(
              "The node installs Docker and a scoped SFTP service. Register its management endpoint and token in your existing panel's Nodes page.",
            )}
          </span>
        </div>
      )}
      <details className="install-advanced">
        <summary>{t("Ports & game connection address")}</summary>
        <AdvancedFields draft={draft} update={update} />
      </details>
      <p className="install-boundary">
        {t(
          "Web tunnels carry the panel and API. Minecraft and SFTP use the node's own addresses and their respective ports.",
        )}
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
  const { t } = useTranslation();
  return (
    <fieldset className="install-profiles">
      <legend className="sr-only">{t("Web access method")}</legend>
      {accessProfiles.map((profile) => (
        <label
          className={`install-profile ${access === profile.id ? "selected" : ""}`}
          key={profile.id}
        >
          <span className="install-profile-heading">
            <strong>{t(profile.name)}</strong>
            <input
              type="radio"
              name="access-profile"
              value={profile.id}
              checked={access === profile.id}
              onChange={() => select(profile.id)}
            />
          </span>
          <span className="tag">{t(profile.badge)}</span>
          <span className="install-profile-description">
            {t(profile.description)}
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
  const { t } = useTranslation();
  return (
    <div className="form-stack">
      <label>
        {t("Game hostname or IP (optional)")}
        <input
          value={draft.publicHost}
          onChange={(event) => update("publicHost", event.target.value)}
          placeholder={t("play.example.com · auto-detect when empty")}
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
            {t(label)}
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
        {t(
          "These ports apply to fresh installations. Upgrades preserve existing ports and credentials; use the current origin shown above when configuring an existing tunnel.",
        )}
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
  const { t } = useTranslation();
  return (
    <section className="panel install-command-card">
      <div className="install-step">
        <span>03</span>
        <div>
          <h2>{t("Make it yours.")}</h2>
          <p>{t("Run this command on your Linux host through SSH.")}</p>
        </div>
      </div>
      <div className="install-command-heading">
        <Terminal size={15} />
        <span>{t("ROOT / SUDO TERMINAL")}</span>
      </div>
      {command ? (
        <pre className="install-command" aria-label={t("Installation command")}>
          <code>{command}</code>
        </pre>
      ) : (
        <div className="install-command-placeholder">
          {t("Complete the settings to generate your command.")}
        </div>
      )}
      <ErrorBox error={error} />
      {command && (
        <CopyButton value={command} label="Copy install command" showLabel />
      )}
      <ol className="install-checklist">
        <li>
          <CheckCircle2 size={15} />
          <span>{t("Download a checksum-verified native binary.")}</span>
        </li>
        <li>
          <CheckCircle2 size={15} />
          <span>
            {t(
              "Install the selected systemd services and required dependencies.",
            )}
          </span>
        </li>
        <li>
          <CheckCircle2 size={15} />
          <span>
            {t(
              draft.role === "agent"
                ? "Connect the node to your existing panel."
                : "Verify the endpoint and print the panel address.",
            )}
          </span>
        </li>
      </ol>
      {draft.role !== "agent" && (
        <div className="install-signin">
          <LockKeyhole size={16} />
          <div>
            <strong>{t("Your first sign-in")}</strong>
            <p>
              {t(
                "Open the printed URL. Retrieve the owner access token in the same SSH session:",
              )}
            </p>
            <code>sudo cat /etc/emberdeck/owner-token</code>
          </div>
        </div>
      )}
      {draft.role !== "agent" && draft.access === "quick" && (
        <p className="install-boundary">
          {t(
            "Quick URLs are temporary and change after a tunnel restart. A Cloudflare connector token gives your workspace a stable address.",
          )}
        </p>
      )}
      {draft.role !== "agent" && draft.access === "local" && (
        <div className="install-signin">
          <Terminal size={16} />
          <div>
            <strong>{t("SSH forwarding")}</strong>
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
