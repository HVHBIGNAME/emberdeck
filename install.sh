#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="HVHBIGNAME/emberdeck"
VERSION="${EMBER_VERSION:-latest}"
MODE="${EMBER_MODE:-all}"
PANEL_LISTEN="${EMBER_PANEL_LISTEN:-127.0.0.1:8080}"
AGENT_LISTEN="${EMBER_AGENT_LISTEN:-127.0.0.1:8081}"
SFTP_LISTEN="${EMBER_SFTP_LISTEN:-0.0.0.0:2022}"
PUBLIC_URL="${EMBER_PUBLIC_URL:-http://localhost:8080}"
PUBLIC_HOST="${EMBER_PUBLIC_HOST:-localhost}"
CONFIG_DIR="/etc/emberdeck"
DATA_DIR="/var/lib/emberdeck"
BINARY="/usr/local/bin/emberdeck"

die() { printf 'Emberdeck: %s\n' "$*" >&2; exit 1; }
step() { printf '\n  → %s\n' "$*"; }

[[ "$(uname -s)" == Linux ]] || die "The installer supports Linux. Download a native CLI binary for other platforms."
[[ "$(id -u)" == 0 ]] || die "Run the installer as root (sudo bash install.sh)."
command -v systemctl >/dev/null || die "systemd is required by this installer. See the manual installation guide."
[[ "$MODE" == all || "$MODE" == panel || "$MODE" == agent ]] || die "EMBER_MODE must be all, panel, or agent."
case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "Supported architectures: x86_64 and aarch64." ;;
esac

step "Checking host dependencies"
if ! command -v curl >/dev/null || { [[ "$MODE" != panel ]] && ! command -v docker >/dev/null; }; then
  command -v apt-get >/dev/null || die "Install curl, CA certificates, and Docker with your package manager, then run this installer again."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends curl ca-certificates
  if [[ "$MODE" != panel ]] && ! command -v docker >/dev/null; then
    apt-get install -y --no-install-recommends docker.io
    systemctl enable --now docker
  fi
fi
if [[ "$MODE" != panel ]]; then
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
    [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9.-]+)?$ ]] || die "Use a release tag such as v0.1.0."
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
if [[ "$MODE" != panel ]]; then systemctl enable emberdeck-agent; systemctl restart emberdeck-agent; fi
if [[ "$MODE" != agent ]]; then systemctl enable emberdeck-panel; systemctl restart emberdeck-panel; fi

step "Installed"
printf '  Config:       %s\n  Data:         %s\n' "$CONFIG_DIR" "$DATA_DIR"
if [[ "$MODE" != agent ]]; then
  printf '  Panel:        %s (use an SSH tunnel or TLS reverse proxy)\n' "$PANEL_LOCATION"
  printf '  Owner token:  sudo cat %s/owner-token\n' "$CONFIG_DIR"
fi
printf '  Service logs: journalctl -u emberdeck-panel -u emberdeck-agent -f\n'
printf '\n  First server: open the panel, choose a blueprint, and explicitly accept the Minecraft EULA.\n'
