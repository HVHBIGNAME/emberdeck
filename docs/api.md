# API & CLI

All panel routes are under `/api`. Authenticate with `Authorization: Bearer <token>` or an HttpOnly browser session. Cookie-authenticated mutations require a matching `Origin`; bearer clients don't need a CSRF cookie.

## Native CLI

```bash
emberdeck cli --help
emberdeck cli --url http://localhost:8080 --token-file /path/to/token servers
emberdeck cli power SERVER_ID start
emberdeck cli command SERVER_ID 'say Server restart in five minutes'
emberdeck cli logs SERVER_ID --tail 200
emberdeck cli files SERVER_ID plugins
emberdeck cli backup SERVER_ID --destination drive
emberdeck cli install SERVER_ID PROJECT_ID VERSION_ID --kind plugin
emberdeck cli jobs SERVER_ID
```

Global CLI flags: `--url` / `EMBER_URL`, `--token` / `EMBER_TOKEN`, `--token-file`, and `--json`. Prefer environment variables or a private token file to avoid command-line history.

Create from a JSON specification:

```json
{
  "name": "My survival world",
  "node_id": "local",
  "template": "paper",
  "version": "1.21.1",
  "loader_version": "",
  "memory_mb": 2048,
  "cpu_limit": 2,
  "disk_mb": 32768,
  "port": 25565,
  "max_players": 20,
  "motd": "A world worth building.",
  "java": null,
  "modpack": null,
  "environment": {},
  "accept_eula": true
}
```

Set `accept_eula` to true only after accepting the [Minecraft EULA](https://www.minecraft.net/eula).

```bash
emberdeck cli create --file server.json
emberdeck cli api GET /api/templates
emberdeck cli api GET '/api/catalog/versions?template=paper'
emberdeck cli api GET '/api/catalog/search?server_id=SERVER_ID&kind=plugin&q=permissions'
```

## Panel endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Exchange `{token}` for a browser cookie |
| GET | `/auth/me` | Current role, permissions, feature availability |
| POST | `/auth/logout` | Revoke the browser session |
| GET | `/overview` | Visible servers, activity and tasks |
| GET / POST | `/servers` | List / create servers (creation: admin) |
| GET / PUT / DELETE | `/servers/{id}` | Read / configure / remove server |
| POST | `/servers/{id}/actions` | Typed operations below |
| GET | `/servers/{id}/logs?tail=400` | Recent logs |
| GET | `/servers/{id}/files?path=/` | Directory entries |
| GET | `/servers/{id}/file?path=server.properties` | File content, encoding and hash |
| GET | `/servers/{id}/packages` | Enabled and disabled JARs |
| GET | `/servers/{id}/backups` | Archives and configured destinations |
| GET | `/servers/{id}/backups/{backup}/download` | Stream an archive |
| GET | `/servers/{id}/jobs` | Background operation progress/results |
| GET | `/servers/{id}/scan` | Last static JAR review |
| GET | `/servers/{id}/analysis` | Local log pattern analysis |
| GET / POST | `/servers/{id}/tasks` | List / create automations |
| PUT / DELETE | `/servers/{id}/tasks/{task}` | Update / remove an automation |
| GET / POST | `/nodes` | Inspect / register nodes (admin) |
| DELETE | `/nodes/{id}` | Remove an empty node (admin) |
| GET / POST | `/tokens` | List / issue scoped tokens (admin) |
| DELETE | `/tokens/{id}` | Revoke a token (admin) |
| GET | `/templates` | Built-in blueprints |
| GET | `/catalog/versions?template=paper` | Published core versions |
| GET | `/catalog/loaders?template=fabric&version=1.21.1` | Core / loader builds |
| GET | `/catalog/search?server_id=…&kind=plugin&q=…` | Compatible package search |
| GET | `/catalog/project/{id}?server_id=…&kind=plugin` | Compatible package versions |
| GET | `/catalog/github?repository=owner/repo` | Public GitHub releases |
| POST | `/assistant` | `{server_id,prompt}` → answer and proposals |

## Typed server actions

Send JSON to `POST /api/servers/{id}/actions`. Long-running operations return a job immediately; poll `/jobs` and check `state`, `error`, and `result`.

```json
{"action":"power","signal":"start"}
{"action":"command","command":"list"}
{"action":"write_file","path":"server.properties","content":"motd=Hello\n","expected_hash":"HASH_FROM_FILE_READ"}
{"action":"upload","path":"plugins/example.jar","data":"BASE64_BYTES"}
{"action":"mkdir","path":"notes"}
{"action":"rename_file","from":"notes/a.txt","to":"notes/b.txt"}
{"action":"remove_file","path":"notes/b.txt"}
{"action":"toggle_package","path":"plugins/example.jar","enabled":false}
{"action":"install_package","project_id":"PROJECT","version_id":"VERSION","kind":"plugin"}
{"action":"install_github","repository":"owner/repo","asset_id":12345,"kind":"plugin","confirm_compatibility":true}
{"action":"backup","destination":"local"}
{"action":"restore","backup_id":"UUID","confirm":true}
{"action":"scan","check_vulnerabilities":false}
{"action":"diagnose","error_text":"Exact startup error","timeout_secs":120,"max_trials":16,"apply_fix":false}
{"action":"cancel_job","job_id":"UUID"}
{"action":"sftp","read_only":true,"ttl_seconds":3600}
```

Example using a request file:

```bash
emberdeck cli api POST /api/servers/SERVER_ID/actions --file action.json
```

Server removal requires a stopped server and body `{"confirmation":"Exact server name"}`. Data is archived as `deleted-<id>` on the node rather than erased. Restores preserve a rollback backup. Package toggles require a restart to affect the running JVM.

## Permissions

`admin` is workspace-wide. Other tokens require explicit `server_ids` (`["*"]` means all) and can receive a subset of their role's permissions:

```text
server.read       server.power
console.read      console.write
files.read        files.write
packages.read     packages.write
backups.read      backups.write
tasks.read        tasks.write
diagnostics.read  diagnostics.write
assistant.use
```

Viewers receive read permissions. Operators receive read/write and assistant permissions. Creating servers, configuring resource limits, registering nodes and issuing tokens are admin operations. Diagnosis with `apply_fix=true` additionally requires `packages.write` and `backups.write`.

```json
{
  "name": "Community moderators",
  "role": "operator",
  "server_ids": ["SERVER_ID"],
  "permissions": ["server.read", "console.read", "console.write", "server.power"],
  "expires_at": null
}
```

Raw tokens are returned once. Revocation is applied to existing cookie sessions because sessions reference the token's current record.

## Node protocol

The panel uses a typed, private `POST /v1/rpc` endpoint on each agent, with a distinct node bearer token. It also streams archives from `/v1/backups/{server}/{backup}`. Authentication runs before body parsing. These privileged endpoints are not intended for browser clients or ordinary server-scoped tokens.
