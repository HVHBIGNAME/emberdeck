# v0.1 verification

Verification date: **2026-10-02**. These results describe the tested paths, rather than a production-hardening certification.

## Automated checks

| Check | Result |
| --- | --- |
| Windows Rust tests | 22 passed |
| Linux x86-64 musl release tests | 23 passed, including capability-root symlink isolation |
| Rust Clippy, all targets, warnings denied | Passed locally |
| TypeScript and Vite production build | Passed |
| Chromium end-to-end tests | 8 passed |
| Bash installer syntax | Passed |

Browser coverage includes navigation, mobile layout, keyboard search and chart inspection, EULA consent, read-only demonstration controls, and preserving the file editor after a successful save and workspace refresh. The successful-save regression uses intercepted API responses; the separate Linux checks below use a real running node.

## Real Linux node

The native musl binary and systemd installer were exercised on Ubuntu 26.04 LTS with Docker 29.1.3, two CPUs and approximately 4 GiB of memory.

- Created and started **Paper 1.21.1 / Java 21**, with a **1536 MiB** memory limit and **1.25 CPU** limit. The agent observed the online server, actual memory/CPU use and zero players.
- Uploaded and read a marker file using the native SFTP service through an administrative SSH tunnel. Verified the web API could read the same bytes. Read-only writes, parent traversal and symbolic-link creation were rejected. Direct external SFTP connectivity timed out from the test client; the listener and protocol worked through the tunnel.
- Installed **LuckPerms Bukkit 5.5.71** from compatible Modrinth metadata. Verified publisher checksum handling, the recorded SHA-256, static JAR review and enable/disable renaming. Confirmed LuckPerms loaded after restart.
- Created an online local archive of approximately **215 MiB**, including the world and installed plugin. Verified that an interval automation ran its console command with the empty-world condition enabled.
- Stopped the server, changed the marker, restored the archive and checked the original bytes. A rollback archive was created, and Minecraft started again.
- Used Chromium against the actual native panel: owner login, restored-file browsing, console command, manual JAR review, a server-scoped viewer's disabled controls and rejected power request, then token revocation invalidating the viewer's existing session. The temporary viewer token was removed.

The integration run exposed and fixed two provider/platform issues: the current Modrinth search API requires the `plugin` project-type facet, and nested Linux capability-directory descriptors require descriptor-relative ownership changes. The archive regression now restores nested directories and verifies ownership.

## Static-analysis follow-up

Aislop 0.13.1 reported **61/100**, with **zero errors, zero automatically fixable findings, and zero lint, format or security findings**. Its remaining 25 warnings comprise:

- 12 maintainability warnings for long UI components/files and repeated blocks. These remain refactoring work.
- 13 fixed-URL warnings. The cited URLs are intentional upstream API endpoints or test/demo origins, rather than deployment credentials or private hosts.

No rule was disabled or reconfigured to obtain this result. Rust, browser and live-node results do not substitute for resolving this maintainability work or for an independent security review.

## Coverage boundaries

Cloud/rclone providers and external AI providers require operator credentials and were not exercised against live accounts. The live game test covers Paper, not every blueprint. Isolated diagnosis has algorithm/dependency-group tests, but a full live failing-plugin minimization campaign was not part of this run. LXC and a native desktop shell are outside v0.1's implemented scope.

GitHub build results and native artifacts are available under [Actions](https://github.com/HVHBIGNAME/emberdeck/actions) and [Releases](https://github.com/HVHBIGNAME/emberdeck/releases).
