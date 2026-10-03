import packageInfo from "../../package.json" with { type: "json" };

export const releaseTag = `v${packageInfo.version}`;
export const repository = "https://github.com/HVHBIGNAME/emberdeck";
export type InstallRole = "all" | "panel" | "agent";
export type AccessMode = "local" | "quick" | "cloudflare" | "caddy" | "proxy";
export interface InstallDraft {
  role: InstallRole;
  access: AccessMode;
  publicUrl: string;
  publicHost: string;
  tokenFile: string;
  panelPort: number;
  agentPort: number;
  sftpPort: number;
}
export type UpdateDraft = <K extends keyof InstallDraft>(
  key: K,
  value: InstallDraft[K],
) => void;
export const initialInstall: InstallDraft = {
  role: "all",
  access: "quick",
  publicUrl: "",
  publicHost: "",
  tokenFile: "",
  panelPort: 8080,
  agentPort: 8081,
  sftpPort: 2022,
};
export const accessProfiles: {
  id: AccessMode;
  name: string;
  badge: string;
  description: string;
}[] = [
  {
    id: "quick",
    name: "Quick HTTPS",
    badge: "NO ACCOUNT",
    description:
      "An automatic trycloudflare.com address. No inbound web ports. The address changes when the tunnel restarts.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Tunnel",
    badge: "CONNECTOR TOKEN",
    description:
      "A stable hostname on your Cloudflare account. Outbound-only connection, with a privately supplied tunnel token.",
  },
  {
    id: "caddy",
    name: "Managed HTTPS",
    badge: "YOUR DOMAIN",
    description:
      "Automatic TLS with a dedicated Caddy container. Requires DNS pointing here and available ports 80 / 443.",
  },
  {
    id: "proxy",
    name: "Existing HTTPS proxy",
    badge: "YOUR INFRASTRUCTURE",
    description:
      "Connect an existing Caddy, Nginx or other TLS reverse proxy to the local panel listener.",
  },
  {
    id: "local",
    name: "Private workspace",
    badge: "SSH ACCESS",
    description:
      "Keep the panel on loopback and connect through SSH forwarding. No public web endpoint.",
  },
];
export const needsHostname = (access: AccessMode) =>
  ["cloudflare", "caddy", "proxy"].includes(access);
export const shellQuote = (value: string) =>
  `'${value.replace(/'/g, "'\\''")}'`;

export function installationError(draft: InstallDraft): string | null {
  const ports = [draft.panelPort, draft.agentPort, draft.sftpPort];
  if (
    ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)
  )
    return "Use whole-number ports between 1024 and 65535.";
  if (new Set(ports).size !== ports.length)
    return "Panel, agent and SFTP need different ports.";
  if (draft.publicHost && !/^[A-Za-z0-9.:[\]-]+$/.test(draft.publicHost))
    return "Enter a game hostname or IP address without a protocol or path.";
  if (draft.role === "agent") return null;
  if (needsHostname(draft.access)) {
    try {
      const url = new URL(draft.publicUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        return "Enter an HTTPS hostname without credentials, a subpath or query parameters.";
      if (
        draft.access === "caddy" &&
        ((url.port && url.port !== "443") ||
          /^\d+(\.\d+){3}$/.test(url.hostname) ||
          !/^[A-Za-z0-9.-]+\.[A-Za-z0-9-]+$/.test(url.hostname))
      )
        return "Managed HTTPS requires a DNS hostname on port 443.";
    } catch {
      return "Enter your public HTTPS URL, such as https://panel.example.com.";
    }
  }
  if (
    draft.access === "cloudflare" &&
    draft.tokenFile &&
    (!draft.tokenFile.startsWith("/") || /[\r\n\0]/.test(draft.tokenFile))
  )
    return "Use an absolute Linux token-file path, or leave it empty for a private terminal prompt.";
  return null;
}

export function installationCommand(draft: InstallDraft): string {
  if (installationError(draft)) return "";
  const flags = [
    `--version ${shellQuote(releaseTag)}`,
    `--mode ${shellQuote(draft.role)}`,
  ];
  if (draft.role !== "agent")
    flags.push(`--access ${shellQuote(draft.access)}`);
  if (draft.role !== "agent" && needsHostname(draft.access))
    flags.push(`--public-url ${shellQuote(new URL(draft.publicUrl).origin)}`);
  if (
    draft.role !== "agent" &&
    draft.access === "cloudflare" &&
    draft.tokenFile
  )
    flags.push(`--tunnel-token-file ${shellQuote(draft.tokenFile)}`);
  if (draft.publicHost)
    flags.push(`--public-host ${shellQuote(draft.publicHost)}`);
  for (const [flag, value, standard] of [
    ["panel-port", draft.panelPort, 8080],
    ["agent-port", draft.agentPort, 8081],
    ["sftp-port", draft.sftpPort, 2022],
  ] as const) {
    if (value !== standard) flags.push(`--${flag} ${value}`);
  }
  const script = `https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/${releaseTag}/install.sh`;
  return `curl -fsSL ${shellQuote(script)} | sudo bash -s -- ${flags.join(" ")}`;
}
