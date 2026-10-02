export interface PlayerState {
  online: number;
  max: number;
  names: string[];
}
export interface Snapshot {
  state: string;
  cpu_percent: number;
  memory_bytes: number;
  disk_bytes: number;
  players: PlayerState | null;
  motd: string;
  started_at: string | null;
  at: number;
  error: string | null;
}
export interface Metric {
  at: number;
  cpu: number;
  memory: number;
  players: number | null;
}
export interface GameServer {
  id: string;
  name: string;
  node_id: string;
  node_name?: string;
  address?: string;
  template: string;
  version: string;
  loader_version: string;
  memory_mb: number;
  cpu_limit: number;
  disk_mb: number;
  port: number;
  max_players: number;
  motd: string;
  java: number | null;
  modpack: string | null;
  environment: Record<string, string>;
  accept_eula: boolean;
  created_at: number;
  snapshot: Snapshot;
  history: Metric[];
}
export interface User {
  id: string;
  name: string;
  role: "admin" | "operator" | "viewer";
  server_ids: string[];
  permissions: string[];
}
export interface Identity {
  user: User;
  assistant_configured: boolean;
  version: string;
}
export interface Activity {
  id: string;
  at: number;
  actor: string;
  action: string;
  server_id: string | null;
  detail: string;
}
export interface Overview {
  servers: GameServer[];
  activity: Activity[];
  tasks: Task[];
  at: number;
}
export interface Template {
  id: string;
  name: string;
  family: string;
  description: string;
  docker_type: string;
  loaders: string[];
  experimental: boolean;
}
export interface NodeInfo {
  name: string;
  version: string;
  os: string;
  architecture: string;
  cpu_cores: number;
  memory_bytes: number;
  docker_version: string;
  backup_destinations: string[];
}
export interface Node {
  id: string;
  name: string;
  url: string;
  public_host: string;
  sftp_port: number;
  info: NodeInfo | null;
}
export interface Job {
  id: string;
  server_id: string;
  kind: string;
  state: string;
  progress: string;
  log: string[];
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}
export interface FileContent {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
  sha256: string;
  size: number;
}
export interface Package {
  name: string;
  path: string;
  kind: string;
  enabled: boolean;
  size: number;
  source: string;
  metadata: { version_id: string; sha256: string; project_id: string } | null;
}
export interface Project {
  project_id: string;
  title: string;
  description: string;
  slug: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
}
export interface ProjectVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: string;
  date_published: string;
  changelog?: string;
  dependencies: { dependency_type: string; project_id: string | null }[];
}
export interface Backup {
  id: string;
  server_id: string;
  name: string;
  size: number;
  sha256: string;
  created_at: number;
  destination: string;
  remote_state: string;
}
export type ScheduledAction =
  | { kind: "command"; command: string }
  | { kind: "power"; signal: string }
  | { kind: "backup"; destination: string };
export interface TaskInput {
  name: string;
  trigger: string;
  cron: string;
  timezone: string;
  interval_seconds: number;
  player_name: string | null;
  only_when_empty: boolean;
  enabled: boolean;
  operation: ScheduledAction;
}
export interface Task {
  id: string;
  server_id: string;
  input: TaskInput;
  next_run: number | null;
  last_run: number | null;
  last_result: string | null;
  created_at: number;
}
export interface Finding {
  severity: string;
  title: string;
  detail: string;
  evidence: string[];
}
export interface Scan {
  at: number | null;
  jars: {
    path: string;
    sha256: string;
    findings: Finding[];
    scanned_entries: number;
  }[];
  verdict?: string;
  limitations?: string[];
  osv?: {
    coordinates: [string, string][];
    results: { vulns?: { id: string }[] }[];
  } | null;
}
export interface AccessToken {
  id: string;
  name: string;
  role: string;
  server_ids: string[];
  permissions: string[];
  expires_at: number | null;
  created_at: number;
}
export interface AssistantReply {
  content: string;
  actions: {
    label: string;
    reason: string;
    request: Record<string, unknown>;
  }[];
  model?: string;
}
