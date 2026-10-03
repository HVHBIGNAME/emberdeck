#!/usr/bin/env bash
set -euo pipefail

MODE="${1:?Access mode is required}"
PUBLIC_URL="${2:-}"
INPUT_TOKEN="${3:-}"
BINARY="${EMBERDECK_BINARY:-/usr/local/bin/emberdeck}"
CONFIG=/etc/emberdeck/panel.toml
STATE=/var/lib/emberdeck/tunnel
UNIT=/etc/systemd/system/emberdeck-tunnel.service
TOKEN_FILE="$STATE/token"
CADDY_CONFIG=/etc/emberdeck/Caddyfile
CLOUD_VERSION=2026.9.3

die() { printf 'Emberdeck access: %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || die 'Run access setup as root.'
[[ -f "$CONFIG" ]] || die 'Install the panel before configuring access.'
[[ "$BINARY" == /usr/local/bin/emberdeck ]] || die 'Install the executable at /usr/local/bin/emberdeck before provisioning system services.'
case "$MODE" in local|quick|cloudflare|caddy|proxy) ;; *) die 'Unknown access mode.' ;; esac

ARGS=(--config "$CONFIG" --mode "$MODE")
[[ -z "$PUBLIC_URL" ]] || ARGS+=(--public-url "$PUBLIC_URL")
[[ "$MODE" != quick ]] || ARGS+=(--url-file "$STATE/public-url")
"$BINARY" access configure "${ARGS[@]}" --check
ORIGIN="$("$BINARY" access inspect --config "$CONFIG" --field origin)"
# Provision against the loopback listener that access configure will install.
case "$ORIGIN" in
  'http://['*) ORIGIN="http://[::1]:${ORIGIN##*:}" ;;
  *) ORIGIN="http://127.0.0.1:${ORIGIN##*:}" ;;
esac
INSTANCE="$("$BINARY" access inspect --config "$CONFIG" --field instance)"
OLD_MODE="$("$BINARY" access inspect --config "$CONFIG" --field mode)"
OLD_PROXY=0
OLD_PROXY_RUNNING=false
OLD_TUNNEL_ACTIVE=0
OLD_TUNNEL_ENABLED=0
if [[ -f "$UNIT" ]]; then
  if systemctl is-active --quiet emberdeck-tunnel; then OLD_TUNNEL_ACTIVE=1; fi
  if systemctl is-enabled --quiet emberdeck-tunnel; then OLD_TUNNEL_ENABLED=1; fi
fi
if command -v docker >/dev/null && docker inspect emberdeck-proxy >/dev/null 2>&1; then
  [[ "$(docker inspect --format '{{index .Config.Labels "dev.emberdeck.proxy"}}' emberdeck-proxy)" == true ]] || die 'A container named emberdeck-proxy is not managed by Emberdeck.'
  OLD_PROXY=1
  OLD_PROXY_RUNNING="$(docker inspect --format '{{.State.Running}}' emberdeck-proxy)"
fi
if [[ "$MODE" == caddy ]]; then
  command -v docker >/dev/null && docker info >/dev/null 2>&1 || die 'Managed HTTPS needs Docker; rerun install.sh --access caddy.'
  if [[ "$OLD_PROXY_RUNNING" != true ]]; then
    command -v ss >/dev/null || die 'Install iproute2 so the installer can check ports 80 and 443.'
    [[ -z "$(ss -H -ltn '( sport = :80 or sport = :443 )')" ]] || die 'Ports 80/443 are occupied. Choose quick, cloudflare, or proxy for this host.'
  fi
fi
if [[ "$OLD_MODE" == caddy ]]; then
  docker info >/dev/null 2>&1 || die 'Start Docker before switching away from the managed proxy.'
fi

WORK="$(mktemp -d)"
chmod 0700 "$WORK"
cp -p "$CONFIG" "$WORK/panel.toml"
[[ ! -f "$UNIT" ]] || cp -p "$UNIT" "$WORK/tunnel.service"
[[ ! -f "$TOKEN_FILE" ]] || cp -p "$TOKEN_FILE" "$WORK/token"
[[ ! -f "$CADDY_CONFIG" ]] || cp -p "$CADDY_CONFIG" "$WORK/Caddyfile"
CHANGED=0
TUNNEL_CHANGED=0
PROXY_CHANGED=0

restart_service() {
  if systemctl restart "$1"; then return 0; fi
  [[ "$(systemctl show "$1" --property=Result --value)" == start-limit-hit ]] || return 1
  printf 'Resetting the start limit for %s after this explicit configuration change.\n' "$1"
  systemctl reset-failed "$1" && systemctl restart "$1"
}

finish() {
  local status="$1"
  if [[ "$status" != 0 && "$CHANGED" == 1 ]]; then
    set +e
    printf '\nRestoring the previous panel access configuration.\n' >&2
    cp -p "$WORK/panel.toml" "$CONFIG"
    restart_service emberdeck-panel || printf 'Panel restart failed; inspect journalctl -u emberdeck-panel.\n' >&2
    if [[ "$TUNNEL_CHANGED" == 1 ]]; then
      systemctl stop emberdeck-tunnel
      if [[ -f "$WORK/token" ]]; then cp -p "$WORK/token" "$TOKEN_FILE"; else rm -f -- "$TOKEN_FILE"; fi
      if [[ -f "$WORK/tunnel.service" ]]; then
        cp -p "$WORK/tunnel.service" "$UNIT"
        systemctl daemon-reload
        if [[ "$OLD_TUNNEL_ENABLED" == 1 ]]; then systemctl enable emberdeck-tunnel; else systemctl disable emberdeck-tunnel; fi
        if [[ "$OLD_TUNNEL_ACTIVE" == 1 ]]; then
          restart_service emberdeck-tunnel || printf 'Previous tunnel restart failed.\n' >&2
        fi
      else
        systemctl disable --now emberdeck-tunnel
        rm -f -- "$UNIT"
        systemctl daemon-reload
      fi
    fi
    if [[ "$PROXY_CHANGED" == 1 ]]; then
      if [[ -f "$WORK/Caddyfile" ]]; then cp -p "$WORK/Caddyfile" "$CADDY_CONFIG"; fi
      if [[ "$OLD_PROXY" == 1 ]]; then
        start_proxy
        if [[ "$OLD_PROXY_RUNNING" != true ]]; then docker stop emberdeck-proxy; fi
      else
        docker rm -f emberdeck-proxy
      fi
    fi
  fi
  rm -rf -- "$WORK"
  exit "$status"
}
trap 'finish $?' EXIT

install_cloudflared() {
  local arch expected actual
  case "$(uname -m)" in
    x86_64) arch=amd64; expected=77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2 ;;
    aarch64|arm64) arch=arm64; expected=aaeb2d7d0da3614634c7e03ab13487a1522c2e79165ed2929cfe23d5e95b326d ;;
    *) die 'cloudflared is packaged for amd64 and arm64.' ;;
  esac
  if [[ -f /usr/local/lib/emberdeck/cloudflared ]]; then
    actual="$(sha256sum /usr/local/lib/emberdeck/cloudflared | awk '{print $1}')"
    [[ "$actual" != "$expected" ]] || return 0
  fi
  curl --proto '=https' --tlsv1.2 -fL --retry 3 "https://github.com/cloudflare/cloudflared/releases/download/$CLOUD_VERSION/cloudflared-linux-$arch" -o "$WORK/cloudflared"
  actual="$(sha256sum "$WORK/cloudflared" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || die 'cloudflared checksum mismatch.'
  install -d -m 0755 /usr/local/lib/emberdeck
  install -m 0755 "$WORK/cloudflared" /usr/local/lib/emberdeck/cloudflared.new
  mv -f /usr/local/lib/emberdeck/cloudflared.new /usr/local/lib/emberdeck/cloudflared
}

prepare_tunnel() {
  install_cloudflared
  if ! id emberdeck-tunnel >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$STATE" --shell /usr/sbin/nologin emberdeck-tunnel
  fi
  install -d -m 0750 -o emberdeck-tunnel -g emberdeck "$STATE"
  if [[ "$MODE" == cloudflare ]]; then
    local token
    if [[ -n "$INPUT_TOKEN" ]]; then
      [[ -f "$INPUT_TOKEN" ]] || die 'The supplied tunnel token file does not exist.'
      [[ "$(stat -c %s "$INPUT_TOKEN")" -le 16384 ]] || die 'Tunnel token file is too large.'
      token="$(tr -d '\r\n' < "$INPUT_TOKEN")"
    elif [[ -f "$TOKEN_FILE" ]]; then
      return 0
    else
      printf 'Cloudflare connector token (hidden): ' >/dev/tty 2>/dev/null || die 'Pass --tunnel-token-file in non-interactive installs.'
      IFS= read -r -s token </dev/tty || die 'Could not read a connector token.'
      printf '\n' >/dev/tty
    fi
    [[ "${#token}" -ge 20 && "${#token}" -le 16384 && "$token" =~ ^[A-Za-z0-9_.+=/-]+$ ]] || die 'Invalid tunnel token format.'
    umask 077
    printf '%s\n' "$token" > "$WORK/new-token"
    unset token
  fi
}

start_tunnel() {
  local token_arg=""
  TUNNEL_CHANGED=1
  if [[ -f "$WORK/new-token" ]]; then
    install -m 0600 -o emberdeck-tunnel -g emberdeck-tunnel "$WORK/new-token" "$TOKEN_FILE"
  fi
  [[ "$MODE" != cloudflare ]] || token_arg=" --token-file $TOKEN_FILE"
  cat > "$UNIT" <<EOF
[Unit]
Description=Emberdeck Cloudflare access tunnel
After=network-online.target emberdeck-panel.service
Wants=network-online.target

[Service]
User=emberdeck-tunnel
Group=emberdeck-tunnel
ExecStart=/usr/local/bin/emberdeck access tunnel --origin $ORIGIN --state-dir $STATE$token_arg
Restart=always
RestartSec=5
WorkingDirectory=$STATE
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$STATE
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable emberdeck-tunnel
  systemctl stop emberdeck-tunnel
  [[ "$MODE" != quick ]] || rm -f -- "$STATE/public-url"
  restart_service emberdeck-tunnel
}

prepare_proxy() {
  docker pull caddy:2
  if ! id emberdeck-proxy >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/emberdeck/proxy --shell /usr/sbin/nologin emberdeck-proxy
  fi
  install -d -m 0700 -o emberdeck-proxy -g emberdeck-proxy /var/lib/emberdeck/proxy /var/lib/emberdeck/proxy/data /var/lib/emberdeck/proxy/config
  printf '{\n  admin off\n}\n%s {\n  reverse_proxy %s\n  header Strict-Transport-Security "max-age=31536000"\n}\n' "$PUBLIC_URL" "$ORIGIN" > "$WORK/Caddyfile"
  chmod 0644 "$WORK/Caddyfile"
  docker run --rm --network none -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile
}

start_proxy() {
  if docker inspect emberdeck-proxy >/dev/null 2>&1; then docker rm -f emberdeck-proxy; fi
  docker run -d --name emberdeck-proxy --label dev.emberdeck.proxy=true --restart unless-stopped \
    --network host --read-only --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true --pids-limit 128 \
    --user "$(id -u emberdeck-proxy):$(id -g emberdeck-proxy)" --memory 256m --cpus 0.5 \
    --tmpfs /tmp:rw,nosuid,nodev,size=64m \
    -v "$CADDY_CONFIG:/etc/caddy/Caddyfile:ro" \
    -v /var/lib/emberdeck/proxy/data:/data -v /var/lib/emberdeck/proxy/config:/config caddy:2
}

case "$MODE" in quick|cloudflare) prepare_tunnel ;; caddy) prepare_proxy ;; esac
if [[ "$MODE" == quick || "$MODE" == cloudflare ]]; then
  CHECK_ARGS=(--origin "$ORIGIN" --state-dir "$STATE" --check)
  if [[ "$MODE" == cloudflare ]]; then
    CHECK_TOKEN="$TOKEN_FILE"
    [[ ! -f "$WORK/new-token" ]] || CHECK_TOKEN="$WORK/new-token"
    CHECK_ARGS+=(--token-file "$CHECK_TOKEN")
  fi
  "$BINARY" access tunnel "${CHECK_ARGS[@]}"
fi
CHANGED=1
"$BINARY" access configure "${ARGS[@]}"
ORIGIN="$("$BINARY" access inspect --config "$CONFIG" --field origin)"
restart_service emberdeck-panel
case "$MODE" in
  quick|cloudflare) start_tunnel ;;
  caddy)
    PROXY_CHANGED=1
    install -m 0644 "$WORK/Caddyfile" "$CADDY_CONFIG"
    start_proxy
    ;;
esac

if [[ "$MODE" != quick && "$MODE" != cloudflare && -f "$UNIT" ]]; then
  TUNNEL_CHANGED=1
  systemctl disable --now emberdeck-tunnel
fi
if [[ "$MODE" != caddy && "$OLD_PROXY" == 1 ]]; then
  PROXY_CHANGED=1
  docker stop emberdeck-proxy
fi

READY=0
for _ in $(seq 1 45); do
  URL="$("$BINARY" access inspect --config "$CONFIG" --field url)"
  TARGET="$URL"
  [[ "$MODE" != local ]] || TARGET="$ORIGIN"
  if [[ -n "$TARGET" ]] && curl --max-time 3 -fsS "$TARGET/healthz" > "$WORK/health" 2>/dev/null && grep -q "\"installation_id\":\"$INSTANCE\"" "$WORK/health"; then
    READY=1
    break
  fi
  sleep 2
done
[[ "$READY" == 1 ]] || die 'The public endpoint did not become ready. Check DNS/hostname routing or outbound tunnel connectivity and service logs.'

if [[ "$MODE" != caddy && "$OLD_PROXY" == 1 ]]; then docker rm emberdeck-proxy; fi
printf '\nPanel URL: %s\nAccess mode: %s\n' "$URL" "$MODE"
if [[ "$MODE" == quick ]]; then printf 'The quick URL changes when the tunnel restarts. Use a connector token for a stable hostname.\n'; fi
if [[ "$MODE" == proxy ]]; then printf 'Point your existing HTTPS reverse proxy to: %s\n' "$ORIGIN"; fi
printf 'Owner token: /etc/emberdeck/owner-token\n'
