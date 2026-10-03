# Architecture & boundaries

## Components

The executable has `panel`, `agent`, `cli`, `demo`, `setup`, `access` and `keygen` modes. `build.rs` embeds the compiled `web/dist` into the executable. Rust serves all production assets; JavaScript tooling is only needed to develop/build the interface.

The panel owns tokens, sessions, node registration, server definitions, automation policies, the audit trail, and cached observations. The node owns actual server directories, Docker operations, per-server RCON secrets, SFTP leases, package integrity records, backups, and background jobs. Both use separate SQLite databases with WAL.

The node runtime uses the Docker Engine API over its local Unix socket. Server bootstrap is delegated to the maintained `itzg/minecraft-server` image. Blueprints select a constrained runtime type and validated environment values; there are no user-defined host shell commands. This release doesn't import Pterodactyl egg scripts.

## Trust model

- The owner credential is a high-entropy token. Additional tokens are stored as SHA-256 hashes, scoped to servers and permissions. Node credentials must be retrievable by the panel and are stored in its protected configuration/database.
- Browser sessions reference token records, expire after 12 hours, and are HttpOnly / SameSite=Strict. Cookie writes check the request origin. With an HTTPS public URL, cookies are Secure.
- The panel service has no Docker socket. A compromised panel with a node token can nevertheless control that node; treat both control plane and management transport as privileged.
- Remote nodes require HTTPS. The supplied installer uses loopback management listeners and keeps credentials out of game volumes.
- Access setup supports private SSH forwarding, temporary and token-based Cloudflare tunnels, a managed Caddy container, and an existing HTTPS proxy. The native tunnel supervisor runs cloudflared as a separate unprivileged account. Connector tokens are private files, while an independently readable URL file lets the panel follow quick-tunnel address changes. Public profiles issue Secure cookies. Only requests arriving from loopback in a configured proxy profile can supply the corresponding client-IP header for login rate limiting.
- File access uses `cap-std` directory capabilities rather than merely checking string prefixes. Traversal, alternate Windows path syntax, and links escaping the server root are rejected. SFTP does not implement shell/exec, link creation, or chmod/chown.
- Game containers are non-root, drop Linux capabilities, use no-new-privileges, have read-only root filesystems and bounded temporary storage, hard CPU/RAM/swap/PID limits, and separate bridge networks. RCON is not published on the host. These are Docker boundaries, not VM-grade isolation or a kernel vulnerability guarantee.
- Disk budgets are measured and checked before managed writes/startup. Minecraft can grow its own data between observations: this is **not a hard filesystem quota**.

## Operations and recovery

Long operations create persisted jobs. A per-server semaphore excludes overlapping writes, restores, diagnosis, and lifecycle operations. SFTP writable handles also hold this permit. Node starts serialize capacity checks to reduce memory overcommit races.

Restarted agents mark unfinished jobs `interrupted`; jobs are not blindly replayed. Inspect the relevant server before retrying. Minecraft containers don't automatically disappear when the panel restarts. Containers use an explicit `no` Docker restart policy in this release; automate start through the panel or change the runtime policy in a reviewed extension.

Backups stream regular files/directories into gzip-compressed tar archives, omit links and special files, and record SHA-256. Online backups run `save-off`, `save-all flush`, and attempt `save-on` after archive creation even if archiving fails. Restores require a stopped server, verify archive integrity, reject links/absolute/traversal paths, enforce an expanded-size budget, stage extraction, and preserve a rollback archive.

## Package and JAR inspection

Modrinth downloads are selected for the exact declared game version and loader. Required dependencies are resolved within a bounded graph. Downloads require HTTPS to a small provider host allowlist, bounded file sizes, and verification against the provider's SHA-512 checksum. GitHub assets require explicit manual compatibility confirmation; SHA-256 is verified when the API provides it. Source metadata and the installed SHA-256 are retained.

Every library installation receives a static JAR review. It bounds entry count, entry size and total expanded size, reads add-on metadata, identifies embedded Maven coordinates, and searches class bytes for behavior-related strings. Findings about process execution, dynamic loading or networking can be legitimate. This is not malware detection with a known-good guarantee.

Manual reviews compare installed bytes with original hashes. Optional OSV lookups send up to 100 embedded Maven coordinates/version pairs. Bundled, renamed, shaded, nested, dynamically downloaded or native code may not be represented or analyzed. Absence of findings is not proof of safety.

## Diagnosis

The original must be stopped. Diagnosis clones its data, reproduces the failure, tests a no-add-on baseline, groups known hard dependencies into connected components, and minimizes a failing group with delta debugging. It then tests the complementary set. Trials are bounded; timeouts and missing dependencies are inconclusive. Trial containers publish no game port but can access the internet for bootstrap downloads.

Optional remediation creates a backup and disables the identified JARs only after the complement starts healthily and the original hashes still match. This finds a failure-inducing startup group, not necessarily a unique guilty plugin. Multiple independent failures, incomplete dependency metadata, timing-sensitive bugs, and in-game-only failures need manual follow-up.

## Assistant

The AI integration is optional. Context is collected only for explicit requests, redacted best-effort, and sent to the configured provider. Tool calls are bounded. Available tools search packages, list compatible versions, and propose changes. They cannot directly execute a command or install a package. A confirmed proposal goes through the same authenticated API as a manual action and remains bound to its original server.

## Current scope

This early release implements web + CLI management, Linux Docker nodes, native SFTP, Modrinth and GitHub sources, local/rclone backups, polling-based automations, and optional AI. It does not yet provide LXC, a packaged desktop GUI, a reliable in-game event/TPS bridge, high-availability control planes, full egg import, resumable uploads, remote-only restore, backup retention management, or a complete antivirus/sandboxing service. Arclight is experimental. Windows hosts the panel/CLI/demo; the agent is Linux-specific.
