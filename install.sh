#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="HVHBIGNAME/emberdeck"
VERSION="${EMBER_VERSION:-v0.2.0}"
MODE="${EMBER_MODE:-all}"
ACCESS="${EMBER_ACCESS:-keep}"
TUNNEL_TOKEN_FILE="${EMBER_TUNNEL_TOKEN_FILE:-}"
PANEL_LISTEN="${EMBER_PANEL_LISTEN:-127.0.0.1:8080}"
AGENT_LISTEN="${EMBER_AGENT_LISTEN:-127.0.0.1:8081}"
SFTP_LISTEN="${EMBER_SFTP_LISTEN:-0.0.0.0:2022}"
PUBLIC_URL="${EMBER_PUBLIC_URL:-}"
PUBLIC_HOST="${EMBER_PUBLIC_HOST:-}"
CONFIG_DIR="/etc/emberdeck"
DATA_DIR="/var/lib/emberdeck"
BINARY="/usr/local/bin/emberdeck"

die() { printf 'Emberdeck: %s\n' "$*" >&2; exit 1; }
step() { printf '\n  → %s\n' "$*"; }

restart_service() {
  if systemctl restart "$1"; then return 0; fi
  [[ "$(systemctl show "$1" --property=Result --value)" == start-limit-hit ]] || return 1
  printf 'Resetting the start limit for %s after this explicit configuration change.\n' "$1"
  systemctl reset-failed "$1" && systemctl restart "$1"
}

usage() {
  cat <<'HELP'
Emberdeck native installer

  curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- [options]

  --access quick         HTTPS through a temporary Cloudflare URL; no inbound web ports
  --access cloudflare    Persistent Cloudflare Tunnel; connector token + --public-url
  --access caddy         Managed HTTPS on your domain; free ports 80/443 and DNS required
  --access proxy         Use an existing HTTPS reverse proxy + --public-url
  --access local         Private loopback access through SSH
  --mode all|panel|agent Components to install (default: all)
  --public-url URL       HTTPS URL for cloudflare, caddy or proxy
  --tunnel-token-file F  Read a Cloudflare connector token from a local file
  --public-host HOST    Minecraft/SFTP hostname or IP
  --panel-port PORT     Panel listener port (default: 8080)
  --agent-port PORT     Agent listener port (default: 8081)
  --sftp-port PORT      SFTP listener port (default: 2022)
  --version TAG         Native release to install
  --help                Show this help

Default: private access on a fresh install; existing access settings are kept on upgrades.
Cloudflare tokens are prompted privately when no token file is provided.
Environment variables EMBER_MODE, EMBER_ACCESS, EMBER_PUBLIC_URL, EMBER_TUNNEL_TOKEN_FILE,
EMBER_PUBLIC_HOST and EMBER_*_LISTEN are also supported.
HELP
}

port() { [[ "$1" =~ ^[1-9][0-9]{3,4}$ && "$1" -ge 1024 && "$1" -le 65535 ]] || die 'Use a port between 1024 and 65535.'; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --access) ACCESS="${2:?Missing access mode}"; shift 2 ;;
    --mode) MODE="${2:?Missing installation mode}"; shift 2 ;;
    --public-url) PUBLIC_URL="${2:?Missing public URL}"; shift 2 ;;
    --public-host) PUBLIC_HOST="${2:?Missing game hostname}"; shift 2 ;;
    --tunnel-token-file) TUNNEL_TOKEN_FILE="${2:?Missing token file}"; shift 2 ;;
    --panel-port) port "${2:?Missing port}"; PANEL_LISTEN="127.0.0.1:$2"; shift 2 ;;
    --agent-port) port "${2:?Missing port}"; AGENT_LISTEN="127.0.0.1:$2"; shift 2 ;;
    --sftp-port) port "${2:?Missing port}"; SFTP_LISTEN="0.0.0.0:$2"; shift 2 ;;
    --version) VERSION="${2:?Missing version}"; shift 2 ;;
    *) die "Unknown option: $1. Run --help for installation profiles." ;;
  esac
done
port "${PANEL_LISTEN##*:}"
port "${AGENT_LISTEN##*:}"
port "${SFTP_LISTEN##*:}"
[[ "${PANEL_LISTEN##*:}" != "${AGENT_LISTEN##*:}" && "${PANEL_LISTEN##*:}" != "${SFTP_LISTEN##*:}" && "${AGENT_LISTEN##*:}" != "${SFTP_LISTEN##*:}" ]] || die 'Use different ports for the panel, agent and SFTP.'
if [[ -z "$PUBLIC_URL" ]]; then
  case "$ACCESS" in cloudflare|caddy|proxy) die 'This access profile requires --public-url https://your-hostname.' ;; esac
  PUBLIC_URL="http://localhost:${PANEL_LISTEN##*:}"
fi

[[ "$(uname -s)" == Linux ]] || die "The installer supports Linux. Download a native CLI binary for other platforms."
[[ "$(id -u)" == 0 ]] || die "Run the installer as root (sudo bash install.sh)."
command -v systemctl >/dev/null || die "systemd is required by this installer. See the manual installation guide."
[[ "$MODE" == all || "$MODE" == panel || "$MODE" == agent ]] || die "EMBER_MODE must be all, panel, or agent."
case "$ACCESS" in keep|local|quick|cloudflare|caddy|proxy) ;; *) die 'Choose keep, local, quick, cloudflare, caddy or proxy access.' ;; esac
[[ "$MODE" != agent || "$ACCESS" == keep || "$ACCESS" == local ]] || die 'Public access profiles apply to a panel, not an agent-only installation.'
if [[ -z "$PUBLIC_HOST" ]]; then
  PUBLIC_HOST="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
  PUBLIC_HOST="${PUBLIC_HOST:-localhost}"
fi
NEEDS_DOCKER=0
[[ "$MODE" == panel && "$ACCESS" != caddy ]] || NEEDS_DOCKER=1
case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "Supported architectures: x86_64 and aarch64." ;;
esac

step "Checking host dependencies"
if ! command -v curl >/dev/null || { [[ "$NEEDS_DOCKER" == 1 ]] && ! command -v docker >/dev/null; }; then
  command -v apt-get >/dev/null || die "Install curl, CA certificates, and Docker with your package manager, then run this installer again."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends curl ca-certificates
  if [[ "$NEEDS_DOCKER" == 1 ]] && ! command -v docker >/dev/null; then
    apt-get install -y --no-install-recommends docker.io
    systemctl enable --now docker
  fi
fi
if [[ "$NEEDS_DOCKER" == 1 ]]; then
  docker info >/dev/null 2>&1 || die "Docker is installed but not running, or its socket is unavailable."
fi

TEMP="$(mktemp -d)"
trap 'rm -rf -- "$TEMP"' EXIT
if [[ -n "${EMBER_BINARY:-}" ]]; then
  [[ -f "$EMBER_BINARY" ]] || die "EMBER_BINARY does not point to a file."
  SOURCE="$EMBER_BINARY"
else
  step "Downloading the native ${ARCH} release"
  if [[ "$VERSION" == latest ]]; then
    RELEASE="https://github.com/${REPOSITORY}/releases/latest/download"
  else
    [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9.-]+)?$ ]] || die "Use a release tag such as v0.2.0."
    RELEASE="https://github.com/${REPOSITORY}/releases/download/${VERSION}"
  fi
  ARCHIVE="emberdeck-linux-${ARCH}.tar.gz"
  curl --proto '=https' --tlsv1.2 -fL --retry 3 "$RELEASE/$ARCHIVE" -o "$TEMP/$ARCHIVE"
  curl --proto '=https' --tlsv1.2 -fL --retry 3 "$RELEASE/SHA256SUMS" -o "$TEMP/SHA256SUMS"
  EXPECTED="$(awk -v name="$ARCHIVE" '$2 == name { print $1 }' "$TEMP/SHA256SUMS")"
  [[ "$EXPECTED" =~ ^[a-fA-F0-9]{64}$ ]] || die "Release checksum is missing or invalid."
  ACTUAL="$(sha256sum "$TEMP/$ARCHIVE" | awk '{print $1}')"
  [[ "$ACTUAL" == "$EXPECTED" ]] || die "Release checksum mismatch. Installation stopped."
  tar -xzf "$TEMP/$ARCHIVE" -C "$TEMP"
  SOURCE="$TEMP/emberdeck"
fi
[[ -f "$SOURCE" ]] || die "The archive does not contain the emberdeck binary."
"$SOURCE" access --help >/dev/null || die 'This installer requires Emberdeck v0.2.0 or newer.'

step "Installing Emberdeck"
if [[ -e "$BINARY" ]]; then cp -p -- "$BINARY" "$BINARY.previous"; fi
install -m 0755 -- "$SOURCE" "$BINARY.new"
mv -f -- "$BINARY.new" "$BINARY"
"$BINARY" --version

if ! id emberdeck >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$DATA_DIR/panel" --shell /usr/sbin/nologin emberdeck
fi
[[ "$(id -u emberdeck)" != 0 ]] || die "The emberdeck service account must not be root."
install -d -m 0750 -o root -g emberdeck "$CONFIG_DIR"
install -d -m 0755 -o root -g root "$DATA_DIR" "$DATA_DIR/servers"
install -d -m 0700 -o root -g root "$DATA_DIR/agent" "$DATA_DIR/backups"
install -d -m 0700 -o emberdeck -g emberdeck "$DATA_DIR/panel"

PANEL_LOCATION="$PUBLIC_URL"
if [[ -e "$CONFIG_DIR/panel.toml" || -e "$CONFIG_DIR/agent.toml" ]]; then
  [[ -f "$CONFIG_DIR/panel.toml" && -f "$CONFIG_DIR/agent.toml" ]] || die "Configuration is incomplete. Restore the missing TOML file before upgrading."
  step "Keeping the existing configuration and tokens"
  PANEL_LOCATION="existing public_url in $CONFIG_DIR/panel.toml"
else
  "$BINARY" setup --config-dir "$CONFIG_DIR" --data-dir "$DATA_DIR" \
    --public-url "$PUBLIC_URL" --public-host "$PUBLIC_HOST" \
    --panel-listen "$PANEL_LISTEN" --agent-listen "$AGENT_LISTEN" --sftp-listen "$SFTP_LISTEN"
fi
chown root:emberdeck "$CONFIG_DIR/panel.toml"
chmod 0640 "$CONFIG_DIR/panel.toml"
chmod 0600 "$CONFIG_DIR/agent.toml"
if [[ -e "$CONFIG_DIR/owner-token" ]]; then chmod 0600 "$CONFIG_DIR/owner-token"; fi

if [[ "$MODE" != agent ]]; then
  cat > /etc/systemd/system/emberdeck-panel.service <<'UNIT'
[Unit]
Description=Emberdeck native control plane
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=emberdeck
Group=emberdeck
ExecStart=/usr/local/bin/emberdeck panel --config /etc/emberdeck/panel.toml
Restart=on-failure
RestartSec=3
WorkingDirectory=/var/lib/emberdeck/panel
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/emberdeck/panel

[Install]
WantedBy=multi-user.target
UNIT
fi

if [[ "$MODE" != panel ]]; then
  cat > /etc/systemd/system/emberdeck-agent.service <<'UNIT'
[Unit]
Description=Emberdeck Docker node and SFTP service
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/emberdeck agent --config /etc/emberdeck/agent.toml
Restart=on-failure
RestartSec=3
WorkingDirectory=/var/lib/emberdeck/agent
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/emberdeck
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
UNIT
fi

systemctl daemon-reload
if [[ "$MODE" != panel ]]; then systemctl enable emberdeck-agent; restart_service emberdeck-agent; fi
if [[ "$MODE" != agent ]]; then systemctl enable emberdeck-panel; restart_service emberdeck-panel; fi

if [[ "$MODE" != agent ]]; then
  if [[ "$ACCESS" != keep ]]; then
    ACCESS_ARGS=(--mode "$ACCESS")
    case "$ACCESS" in cloudflare|caddy|proxy) ACCESS_ARGS+=(--public-url "$PUBLIC_URL") ;; esac
    [[ -z "$TUNNEL_TOKEN_FILE" ]] || ACCESS_ARGS+=(--token-file "$TUNNEL_TOKEN_FILE")
    "$BINARY" access install "${ACCESS_ARGS[@]}"
  fi
  PANEL_LOCATION="$("$BINARY" access inspect --field url)"
  ORIGIN="$("$BINARY" access inspect --field origin)"
  INSTANCE="$("$BINARY" access inspect --field instance)"
  HEALTHY=0
  for _ in $(seq 1 15); do
    if curl --max-time 2 -fsS "$ORIGIN/healthz" > "$TEMP/health" 2>/dev/null && grep -q "\"installation_id\":\"$INSTANCE\"" "$TEMP/health"; then HEALTHY=1; break; fi
    sleep 1
  done
  [[ "$HEALTHY" == 1 ]] || die 'The panel did not become healthy. Inspect journalctl -u emberdeck-panel.'
fi

step "Installed"
printf '  Config:       %s\n  Data:         %s\n' "$CONFIG_DIR" "$DATA_DIR"
if [[ "$MODE" != agent ]]; then
  printf '  Panel:        %s\n' "$PANEL_LOCATION"
  if [[ "$PANEL_LOCATION" == http://* ]]; then printf '  Connection:   use SSH forwarding for this private HTTP address\n'; fi
  printf '  Owner token:  sudo cat %s/owner-token\n' "$CONFIG_DIR"
fi
printf '  Service logs: journalctl -u emberdeck-panel -u emberdeck-agent -f\n'
printf '\n  First server: open the panel, choose a blueprint, and explicitly accept the Minecraft EULA.\n'
