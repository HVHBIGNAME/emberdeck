# Installation profiles

Use **Install & connect** in the web interface, on the sign-in screen, or in the [hosted installation wizard](https://hvhbigname.github.io/emberdeck/#/install). The wizard validates your settings and copies a single-line command suitable for pasting into an SSH terminal.

The installer targets Ubuntu/Debian with systemd, on amd64 or arm64. It downloads a checksum-verified native release and automatically configures the selected services. Python, Node.js and Rust build tools are not runtime dependencies.

## Choose your connection

| Profile | Command option | Requirements | Address |
| --- | --- | --- | --- |
| Quick HTTPS | `--access quick` | Outbound Cloudflare connectivity | Automatic, temporary `trycloudflare.com` URL |
| Cloudflare Tunnel | `--access cloudflare` | A connector token and a configured public hostname | Stable HTTPS hostname, no inbound web ports |
| Managed HTTPS | `--access caddy` | Your DNS hostname and free inbound ports 80/443 | Automatic TLS with a dedicated Caddy container |
| Existing proxy | `--access proxy` | An already configured HTTPS reverse proxy | Your existing HTTPS hostname |
| Private workspace | `--access local` | SSH access | Loopback HTTP through SSH forwarding |

These profiles expose the **web panel and its API**. Minecraft clients and SFTP use the node's own addresses and ports. A public HTTP tunnel does not turn Minecraft or SFTP into HTTP services.

## 1. Quick HTTPS, without an account

```bash
curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- --access quick
```

The installer downloads a pinned, checksum-verified `cloudflared` binary, starts `emberdeck-tunnel.service` as a dedicated unprivileged user, and verifies that the public address reaches this specific panel. It prints the HTTPS URL when ready.

Open that address. In the same SSH session, retrieve the panel's owner credential:

```bash
sudo cat /etc/emberdeck/owner-token
```

The owner token is an Emberdeck login credential; a Cloudflare connector token connects the tunnel to Cloudflare. They have different purposes.

**Quick URLs change when the tunnel process restarts**, including after a host reboot. The panel reads the new address automatically and continues issuing Secure cookies. Retrieve the current address with:

```bash
sudo emberdeck access inspect --field url
```

Use a managed Cloudflare tunnel for a stable everyday address. Quick tunnels are intended for evaluation and temporary access and inherit Cloudflare's quick-tunnel service limits.

## 2. A persistent Cloudflare Tunnel

In the Cloudflare dashboard:

1. Create a remotely managed tunnel.
2. Add your public hostname, for example `panel.example.com`.
3. Set its HTTP service to `http://127.0.0.1:8080` for a fresh default installation. For an existing panel, use the actual origin printed by `sudo emberdeck access inspect --field origin`.
4. Copy the **connector token** from the tunnel's connector setup screen.

Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- --access cloudflare --public-url https://panel.example.com
```

The installer asks for the connector token through a hidden terminal prompt. It is stored at `/var/lib/emberdeck/tunnel/token`, readable only by its owner and root, and passed to cloudflared using `--token-file`, rather than as a process argument.

For automation, supply an existing private token file:

```bash
curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- --access cloudflare --public-url https://panel.example.com --tunnel-token-file /root/cloudflared-token
```

Token-file paths may contain spaces or quotes; the web wizard quotes them for Bash. Keep the actual token in the file or terminal prompt, rather than in an installation URL or a public issue. To rotate it on an existing installation:

```bash
sudo emberdeck access install --mode cloudflare --public-url https://panel.example.com --token-file /root/replacement-token
```

The installer verifies routing; the hostname must already be connected to the tunnel in Cloudflare. A connector token alone does not grant the DNS/account-management permissions needed to create that routing.

## 3. Managed HTTPS on your domain

Point your domain's DNS at the server and make TCP ports 80 and 443 available:

```bash
curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- --access caddy --public-url https://panel.example.com
```

This starts a dedicated, labelled `emberdeck-proxy` Caddy container. Certificates and Caddy state persist under `/var/lib/emberdeck/proxy`. The panel stays on loopback. The container uses a read-only root filesystem, an unprivileged user and bounded CPU/memory.

Port conflicts are detected before changing the access configuration. Existing proxy configuration is not imported into this managed container. If a web service already owns 80/443, use its routing with the existing-proxy profile, or choose an outbound tunnel.

## 4. Your existing reverse proxy

Configure the hostname on your existing proxy first. For Caddy, the route is:

```caddyfile
panel.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

For Nginx, preserve `Host` and set the forwarded client address from your trusted proxy chain. Then configure Emberdeck:

```bash
sudo emberdeck access install --mode proxy --public-url https://panel.example.com
```

The installer checks the public endpoint from the host. The health response contains an opaque installation identifier so an unrelated service at a mistyped address is not accepted as this panel. No owner credential is sent during this probe.

## 5. Private installation

```bash
curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- --access local
```

From your computer:

```bash
ssh -L 8080:127.0.0.1:8080 root@your-server
```

Open `http://localhost:8080`. A fresh installation with no `--access` flag also uses private loopback access.

## Components and ports

- `--mode all`: panel and Minecraft node, the default.
- `--mode panel`: only the control plane; connect remote nodes afterward. Docker is needed here only if using managed Caddy.
- `--mode agent`: only a Minecraft node and SFTP. Register its management endpoint/token in the main panel; public panel-access profiles are not applied to agent-only installations.

For example:

```bash
curl -fsSL https://raw.githubusercontent.com/HVHBIGNAME/emberdeck/main/install.sh | sudo bash -s -- --mode all --access quick --panel-port 18080 --agent-port 18081 --sftp-port 22022 --public-host play.example.com
```

Ports must be distinct integers from 1024 through 65535. On a fresh installation the game hostname defaults to the primary IPv4 route's source address when available; use `--public-host` to specify the correct public or LAN address for your players.

Existing configurations, tokens and listener ports are preserved on upgrades. Explicitly selecting an access mode updates the web URL and moves its listener to loopback. Configuration comments and unrelated values are preserved. An upgrade without `--access` keeps the current access service, so it does not unnecessarily change a quick URL.

The environment equivalents are `EMBER_ACCESS`, `EMBER_MODE`, `EMBER_PUBLIC_URL`, `EMBER_TUNNEL_TOKEN_FILE`, `EMBER_PUBLIC_HOST` and `EMBER_*_LISTEN`. `EMBER_BINARY=/absolute/path/to/emberdeck` supports a locally built executable. The bootstrap script defaults to its matching release; `--version` or `EMBER_VERSION` can select another compatible release.

## Inspect, recover and switch

```bash
sudo emberdeck access inspect
sudo systemctl status emberdeck-panel emberdeck-tunnel
sudo journalctl -u emberdeck-tunnel -f
```

Change the access method without reinstalling the application:

```bash
sudo emberdeck access install --mode quick
sudo emberdeck access install --mode local
```

Setup performs preflight checks and rolls back its access configuration if endpoint verification fails. Credentials and saved configuration are staged in a private temporary directory during the change. A failed new quick-tunnel process is stopped; restoring an earlier quick-tunnel service can produce a new temporary URL, available through `access inspect`.

Switching profiles briefly interrupts access: the old managed route is stopped before the replacement is verified, so a retiring tunnel or proxy cannot incorrectly satisfy the new profile's readiness check. Rollback preserves whether the previous tunnel was enabled and running.

If an explicit setup/recovery restart encounters systemd's `start-limit-hit`, it clears that service's failed start counter and retries once. Automatic crash-loop limits remain configured on the service.

Cloudflared's metrics listener is confined to loopback and its extra management diagnostics are disabled. Only the configured loopback proxy's client-IP headers are used for login rate limiting. See [architecture](architecture.md) for the wider trust model and [operations](guide.md) for backups, SFTP and Minecraft management.
