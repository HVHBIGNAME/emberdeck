# Verification

Latest local verification: **2026-10-08**, covering the interface refinement after v0.3.0. This includes Minecraft screenshot artwork, Manrope/Golos Text typography, complete-card navigation, cursor geometry, animated controls and optional smooth startup. The checks below distinguish this build from earlier Rust and Linux baselines. Published CI and release results are linked under Actions and Releases below.

## Automated checks

| Check | Result |
| --- | --- |
| Windows Rust tests (v0.3 baseline) | 26 passed |
| Linux x86-64 musl release tests (v0.2 baseline) | 27 passed, including capability-root symlink isolation |
| Rust Clippy, all targets, warnings denied (v0.3 baseline) | Passed locally |
| TypeScript and Vite production build | Passed |
| Chromium end-to-end tests against the production bundle | 44 passed |
| Native Windows executable with the current UI | `cargo build --release --locked`; launched from a separate working directory |
| Embedded UI under the native Content Security Policy | All 10 font subsets, WebP artwork, licenses, Russian text, themes, slider input and 320/390px login layouts passed |
| Hosted-demo configuration, served locally at `/emberdeck/` | Assets, fonts, Russian overview and persisted appearance passed; no external asset requests or browser errors |
| Production npm dependency audit | Zero vulnerabilities |
| Bootstrap and embedded access installer Bash syntax (v0.3 baseline) | Passed |

Browser coverage includes navigation, keyboard search and chart inspection, EULA consent, read-only demonstration controls, preserving the file editor after a successful save, installation profiles before login, command copying/quoting, port and URL validation, and readable non-JSON gateway errors. Fixture and error-path tests use intercepted API responses; the Linux checks below use the real native panel.

The new coverage exercises light/dark layouts at **2560, 390 and 320 pixels**, including large text and Russian page headings; checks 14 views per layout; verifies keyboard selectors, nested Escape handling and focus restoration; switches system theme and reduced motion live; checks the outline cursor and touch input; verifies cross-tab preference synchronization, reset, invalid settings and blocked storage; uploads/resizes/removes a local background; and confirms the library remains usable after selecting a Vanilla server. The default entry point is the overview, with installation help in Settings.

The design checks click the full server and blueprint surfaces, exercise independent copy/menu actions, compare all four cursor corners and rounded switches, frame selector portals, sample intermediate slider-animation widths, and drag a slider while its entire field stays outlined. Motion-off behavior, decoded WebP covers and loaded Cyrillic fonts are also checked. Mobile checks now catch clipped blueprint labels and the console-download button in addition to document overflow.

Six startup checks verify the **900ms minimum** with a controlled browser clock, parallel workspace loading, inert controls until the overlay finishes, persisted opt-out, no repeated splash on in-app navigation, automatic bypass for disabled/reduced motion, real slow authentication and immediate connection-error reporting.

The native Windows smoke check served embedded assets from a separate working directory, applied the real CSP and exercised theme/background changes. Its login-layout check used a deliberate 401 fixture. The check caught Vite inlining a small font subset as a `data:` URL; font assets are now emitted as separate local files, and a browser regression test loads every subset using the policy read from `src/web.rs`. The final native run reported no JavaScript or unexpected resource errors. The executable includes the font-license text and all seven artwork covers with the correct WebP MIME type.

The frontend is split into shared React, motion, controls and i18n chunks, each below Vite's default warning threshold. Eighteen screenshots and an approximately **30-second, 1920 × 1080** walkthrough were captured in `docs/media`; the H.264 MP4 and WebM show startup, card hover, selectors, slider dragging and theme/language changes. The source and static demo are published through the `main` workflows; native release artifacts have their own tagged-release workflow.

## HTTPS access and upgrades — v0.2 baseline

- Installed the native v0.2 binary over the existing systemd deployment. Existing owner/node credentials and listener ports were preserved. An upgrade without an access flag kept the same running tunnel process and public URL.
- Provisioned a real outbound quick tunnel using checksum-verified cloudflared 2026.9.3. The public HTTPS `/healthz` response matched the local installation identifier.
- Used Chromium through that public URL: pre-login wizard, owner login, HttpOnly/Secure/SameSite=Strict session cookie, same-origin console command, admin deployment information and mobile layout. Missing/foreign Origin mutations and a viewer's deployment request were rejected. Temporary test credentials and sessions were removed.
- Switched from quick HTTPS to private loopback access and back. The private profile stopped and disabled the tunnel; local health remained available.
- Forced a readiness-probe failure during setup and verified exact configuration rollback, including preserving a previously disabled/stopped tunnel's service state.
- Simulated replacement readiness depending on the retiring tunnel. Setup rejected that dependency and restored the previously active/enabled tunnel.
- Deliberately reached systemd's real `start-limit-hit`, then verified that explicit access setup reset the counter once and restored a working panel.
- Restarted only the tunnel, observed a different working HTTPS URL, and verified that the panel process did not restart. The owner/node credentials, Minecraft container and unrelated host containers were unchanged.
- Verified that managed Caddy rejects occupied ports 80/443 before changing panel configuration. A live public certificate was not requested on the shared test host.

The integration run caught incompatible cloudflared flags; startup now uses the pinned binary's supported options and performs a command-line preflight. URL validation rejects control characters, configuration edits preserve unrelated TOML values/comments, and rollback retains the previous access-service state.

## Game-operation baseline

The native musl binary and systemd installer were exercised on Ubuntu 26.04 LTS with Docker 29.1.3, two CPUs and approximately 4 GiB of memory.

- Created and started **Paper 1.21.1 / Java 21**, with a **1536 MiB** memory limit and **1.25 CPU** limit. The agent observed the online server, actual memory/CPU use and zero players.
- Uploaded and read a marker file using the native SFTP service through an administrative SSH tunnel. Verified the web API could read the same bytes. Read-only writes, parent traversal and symbolic-link creation were rejected. Direct external SFTP connectivity timed out from the test client; the listener and protocol worked through the tunnel.
- Installed **LuckPerms Bukkit 5.5.71** from compatible Modrinth metadata. Verified publisher checksum handling, the recorded SHA-256, static JAR review and enable/disable renaming. Confirmed LuckPerms loaded after restart.
- Created an online local archive of approximately **215 MiB**, including the world and installed plugin. Verified that an interval automation ran its console command with the empty-world condition enabled.
- Stopped the server, changed the marker, restored the archive and checked the original bytes. A rollback archive was created, and Minecraft started again.
- Used Chromium against the actual native panel: owner login, restored-file browsing, console command, manual JAR review, a server-scoped viewer's disabled controls and rejected power request, then token revocation invalidating the viewer's existing session. The temporary viewer token was removed.

The integration run exposed and fixed two provider/platform issues: the current Modrinth search API requires the `plugin` project-type facet, and nested Linux capability-directory descriptors require descriptor-relative ownership changes. The archive regression now restores nested directories and verifies ownership.

## Static-analysis follow-up

The current changed-source Aislop 0.13.1 scan reports **84/100**, with **zero errors, zero automatically fixable findings, and zero lint, format, AI-slop or security findings**. Eight non-automatic maintainability warnings remain: long components in `Library.tsx`, `ServerPage.tsx` and `WorkspacePages.tsx`, plus repeated UI blocks in `WorkspacePages.tsx` and `app.tsx`. Prettier checks for the modified controls, tests and capture script and `git diff --check` pass.

The earlier full application-source v0.3 scan reported **58/100**, with zero errors, zero automatically fixable findings, and zero lint, format or security findings. Its 30 warnings comprised:

- 15 maintainability warnings for long UI components/files, demo fixtures and repeated blocks. Navigation and operation notifications are now shared modules; larger file, server and access-management components remain refactoring work.
- 15 fixed-URL warnings. The cited URLs are intentional upstream API endpoints or test/demo origins, rather than deployment credentials or private hosts.

No rule was disabled or reconfigured to obtain this result. Rust, browser and live-node results do not substitute for resolving this maintainability work or for an independent security review.

## Coverage boundaries

Named Cloudflare tunnels, public Caddy certificate issuance and an independent operator-managed HTTPS proxy were not exercised with live account/domain credentials. Quick-tunnel URLs are temporary. Cloud/rclone and external AI providers also require operator credentials and were not exercised against live accounts. The game baseline covers Paper, not every blueprint. Isolated diagnosis has algorithm/dependency-group tests, but a full live failing-plugin minimization campaign was not part of this run. LXC and a native desktop shell remain outside the implemented scope.

GitHub build results and native artifacts are available under [Actions](https://github.com/HVHBIGNAME/emberdeck/actions) and [Releases](https://github.com/HVHBIGNAME/emberdeck/releases).
