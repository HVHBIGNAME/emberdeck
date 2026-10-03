# Contributing

Emberdeck is an early-stage Rust application with a React/TypeScript interface. Keep the native runtime self-contained; Node is a build/development dependency only.

## Layout

```text
src/agent.rs        node protocol and operations
src/runtime.rs      Docker Engine client
src/panel.rs        authenticated control-plane API
src/auth.rs         scoped tokens and browser sessions
src/access.rs       access profiles, URL validation and host configuration
src/tunnel.rs       native cloudflared supervision and rotating URL publication
src/files.rs        capability-confined filesystem access
src/sftp.rs         native SSH/SFTP subsystem
src/catalog.rs      version catalogs and package providers
src/backups.rs      archive, remote copy and restore
src/diagnostics.rs  isolated startup delta debugging
src/security.rs     bounded static inspection and log insights
src/scheduler.rs    time/player-aware automation
src/assistant.rs    optional tool-limited AI integration
web/src/           embedded UI and clearly marked demo fixtures
web/tests/         browser behavior tests
```

## Local development

```bash
npm ci
npm run build
cargo run -- demo --listen 127.0.0.1:8080
```

For UI hot reload: `npm run dev`, then open `http://localhost:5173/demo`. The Vite proxy targets a panel at `127.0.0.1:8080` for authenticated development.

For real node tests, use a dedicated Linux host. Explicitly accept the Minecraft EULA when creating test servers. Don't commit server worlds, provider keys, node/owner tokens, or real host credentials.

## Checks

```bash
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
npm run build
npx playwright install chromium
npm run test:e2e
bash -n install.sh
bash -n scripts/access-install.sh
```

Build the web UI before a release: `build.rs` embeds the current `web/dist`. A Rust-only development build without assets intentionally serves a build-instructions page.

The browser suite builds and serves the production bundle on loopback port 4173. Set `EMBER_TEST_URL` to test an already running compatible instance instead. Installation tests cover pre-login access, profile validation, shell quoting and proxy error responses.

Test security boundaries with negative cases: cross-server permissions, revocation, CSRF, traversal/symlink attempts, archive links/limits, unknown player state, and inconclusive diagnosis. Do not relabel heuristic scanner results as “safe”.

The entry point is `web/src/main.tsx`; TypeScript follows its import graph. Browser screenshots and demo video can be regenerated with `node scripts/capture-demo.mjs` while a native demo runs. Set `EMBER_CAPTURE_URL` if it uses a non-default port.

## Releases

Tagged releases build static Linux amd64/arm64 binaries and a Windows panel/CLI binary. The release workflow publishes archives plus `SHA256SUMS`. The separate Pages workflow builds only the explicitly read-only fixture workspace.
