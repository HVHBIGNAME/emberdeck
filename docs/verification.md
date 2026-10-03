# v0.2 verification

Verification date: **2026-10-03**. These results describe the tested paths, rather than a production-hardening certification. The game-operation baseline below was established on v0.1 on 2026-10-02; v0.2 adds the access and upgrade checks.

## Automated checks

| Check | Result |
| --- | --- |
| Windows Rust tests | 26 passed |
| Linux x86-64 musl release tests | 27 passed, including capability-root symlink isolation |
| Rust Clippy, all targets, warnings denied | Passed locally |
| TypeScript and Vite production build | Passed |
| Chromium end-to-end tests against the production bundle | 12 passed |
| Bootstrap and embedded access installer Bash syntax | Passed |

Browser coverage includes navigation, mobile layout, keyboard search and chart inspection, EULA consent, read-only demonstration controls, preserving the file editor after a successful save, installation profiles before login, command copying/quoting, port and URL validation, and readable non-JSON gateway errors. Fixture and error-path tests use intercepted API responses; the Linux checks below use the real native panel.

## HTTPS access and upgrades

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

Aislop 0.13.1 reported **59/100** on an isolated snapshot of the release's tracked source files, with **zero errors, zero automatically fixable findings, and zero lint, format or security findings**. Its remaining 27 warnings comprise:

- 12 maintainability warnings for long UI components/files and repeated blocks. This includes similar installation-profile data records; the older large components remain refactoring work.
- 15 fixed-URL warnings. The cited URLs are intentional upstream API endpoints or test/demo origins, rather than deployment credentials or private hosts.

No rule was disabled or reconfigured to obtain this result. Rust, browser and live-node results do not substitute for resolving this maintainability work or for an independent security review.

## Coverage boundaries

Named Cloudflare tunnels, public Caddy certificate issuance and an independent operator-managed HTTPS proxy were not exercised with live account/domain credentials. Quick-tunnel URLs are temporary. Cloud/rclone and external AI providers also require operator credentials and were not exercised against live accounts. The game baseline covers Paper, not every blueprint. Isolated diagnosis has algorithm/dependency-group tests, but a full live failing-plugin minimization campaign was not part of this run. LXC and a native desktop shell remain outside the implemented scope.

GitHub build results and native artifacts are available under [Actions](https://github.com/HVHBIGNAME/emberdeck/actions) and [Releases](https://github.com/HVHBIGNAME/emberdeck/releases).
