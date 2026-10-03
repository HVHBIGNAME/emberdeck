import packageInfo from "../../package.json" with { type: "json" };
import type {
  Activity,
  Backup,
  GameServer,
  Node,
  Overview,
  Package,
  Project,
  Task,
  Template,
} from "./types";

const now = Math.floor(Date.now() / 1000);
const { version } = packageInfo;
const gi = 1024 ** 3;
const configurations = [
  [
    "oakheart",
    "Oakheart SMP",
    "paper",
    "1.21.1",
    18,
    4096,
    24,
    2.36,
    25565,
    "online",
  ],
  [
    "everfrost",
    "Everfrost",
    "fabric",
    "1.21.1",
    7,
    4096,
    38,
    3.12,
    25566,
    "online",
  ],
  [
    "workshop",
    "The Workshop",
    "paper",
    "1.21.4",
    3,
    2048,
    9,
    1.08,
    25567,
    "online",
  ],
  [
    "deepslate",
    "Deepslate Adventures",
    "neoforge",
    "1.21.1",
    0,
    4096,
    0,
    0,
    25568,
    "offline",
  ],
] as const;
const playerCurve = [
  5, 5, 6, 4, 6, 8, 9, 7, 10, 12, 12, 10, 13, 11, 14, 16, 14, 17, 19, 17, 20,
  23, 22, 21, 25, 24, 27, 30, 28, 31, 29, 32, 31, 34, 33, 31, 30, 32, 29, 30,
  27, 29, 28, 29, 27, 28, 29, 28,
];

export const demoServers: GameServer[] = configurations.map(
  (
    [id, name, template, version, players, memory, cpu, used, port, state],
    index,
  ) => ({
    id,
    name,
    template,
    version,
    node_id: "local",
    node_name: "eu-central-01",
    address: `play.emberdeck.test:${port}`,
    port,
    loader_version: "",
    memory_mb: memory,
    cpu_limit: index === 1 ? 3 : 2,
    disk_mb: 32768,
    max_players: 50,
    motd: "A little place to build something great.",
    java: 21,
    modpack: null,
    environment: {},
    accept_eula: true,
    created_at: now - 86400 * 14,
    snapshot: {
      state,
      cpu_percent: cpu,
      memory_bytes: used * gi,
      disk_bytes: (index + 1) * 1.13 * gi,
      players:
        state === "online"
          ? {
              online: players,
              max: 50,
              names: ["Alex", "BuilderBee", "Mossy"].slice(0, players),
            }
          : null,
      motd: "A little place to build something great.",
      started_at: new Date((now - 86400 * 3 - 14400) * 1000).toISOString(),
      at: now,
      error: null,
    },
    history: playerCurve.map((v, i) => ({
      at: now - (47 - i) * 1800,
      cpu: state === "online" ? Math.max(2, cpu + Math.sin(i * 1.4) * 9) : 0,
      memory: used * gi * (0.88 + i / 400),
      players: state === "online" ? Math.round((v * players) / 28) : 0,
    })),
  }),
);
export const demoTasks: Task[] = [
  {
    id: "nightly",
    server_id: "oakheart",
    input: {
      name: "A quiet-world backup",
      trigger: "cron",
      cron: "0 4 * * *",
      timezone: "UTC",
      interval_seconds: 3600,
      player_name: null,
      only_when_empty: true,
      enabled: true,
      operation: { kind: "backup", destination: "local" },
    },
    next_run: now + 7200,
    last_run: now - 79120,
    last_result: "Completed",
    created_at: now - 86400 * 10,
  },
  {
    id: "welcome",
    server_id: "oakheart",
    input: {
      name: "Make yourself at home",
      trigger: "player_join",
      cron: "",
      timezone: "UTC",
      interval_seconds: 3600,
      player_name: null,
      only_when_empty: false,
      enabled: true,
      operation: { kind: "command", command: "say Welcome home, {player}!" },
    },
    next_run: null,
    last_run: now - 600,
    last_result: "Completed",
    created_at: now - 86400 * 4,
  },
];
const activity: Activity[] = [
  {
    id: "a1",
    at: now - 120,
    actor: "Owner",
    action: "Backup completed",
    server_id: "oakheart",
    detail: "Oakheart SMP · local storage",
  },
  {
    id: "a2",
    at: now - 480,
    actor: "Owner",
    action: "Package installed",
    server_id: "everfrost",
    detail: "Lithium · compatible with Fabric 1.21.1",
  },
  {
    id: "a3",
    at: now - 2700,
    actor: "Owner",
    action: "Server started",
    server_id: "workshop",
    detail: "The Workshop is ready for players",
  },
  {
    id: "a4",
    at: now - 4200,
    actor: "Owner",
    action: "Access token created",
    server_id: null,
    detail: "Community moderators · operator access",
  },
];
const overview: Overview = {
  servers: demoServers,
  activity,
  tasks: demoTasks,
  at: now,
};
const node: Node = {
  id: "local",
  name: "eu-central-01",
  url: "https://node.emberdeck.test",
  public_host: "play.emberdeck.test",
  sftp_port: 2022,
  info: {
    name: "eu-central-01",
    version,
    os: "Ubuntu 24.04 LTS",
    architecture: "x86_64",
    cpu_cores: 8,
    memory_bytes: 16 * gi,
    docker_version: "29.1",
    backup_destinations: ["local", "gdrive"],
  },
};
export const demoTemplates: Template[] = [
  [
    "paper",
    "Paper",
    "plugins",
    "Fast, familiar, and built for your community.",
    ["paper", "spigot", "bukkit"],
  ],
  [
    "purpur",
    "Purpur",
    "plugins",
    "Paper performance, with more ways to make it yours.",
    ["purpur", "paper"],
  ],
  [
    "folia",
    "Folia",
    "plugins",
    "Region-threaded worlds for ambitious communities.",
    ["folia"],
  ],
  ["vanilla", "Vanilla", "vanilla", "Minecraft, just as it comes.", []],
  [
    "fabric",
    "Fabric",
    "mods",
    "Lightweight modding for ambitious worlds.",
    ["fabric"],
  ],
  ["forge", "Forge", "mods", "The classic home for large modpacks.", ["forge"]],
  [
    "neoforge",
    "NeoForge",
    "mods",
    "A modern foundation for your next adventure.",
    ["neoforge"],
  ],
  [
    "quilt",
    "Quilt",
    "mods",
    "Community-driven, open modding.",
    ["quilt", "fabric"],
  ],
  [
    "arclight",
    "Arclight",
    "hybrid",
    "Forge mods and Bukkit plugins in one world.",
    ["forge", "bukkit"],
  ],
].map(([id, name, family, description, loaders]) => ({
  id: String(id),
  name: String(name),
  family: String(family),
  description: String(description),
  loaders: loaders as string[],
  docker_type: String(id).toUpperCase(),
  experimental: id === "arclight",
}));

const packages: Package[] = [
  ["LuckPerms", "luckperms-bukkit-5.4.151.jar", 1.5],
  ["spark", "spark-1.10.119-bukkit.jar", 3.4],
  ["Chunky", "Chunky-Bukkit-1.4.28.jar", 0.4],
  ["WorldEdit", "worldedit-bukkit-7.3.8.jar", 6.9],
  ["BlueMap", "BlueMap-5.5-paper.jar", 11.2],
].map(([name, file, size]) => ({
  name: String(file),
  path: `plugins/${file}`,
  kind: "plugin",
  enabled: true,
  size: Number(size) * 1024 ** 2,
  source: "modrinth",
  metadata: {
    project_id: String(name).toLowerCase(),
    version_id: "demo-version",
    sha256: "76a19ce598cb7f924d84a8c6e1b934d4",
  },
}));
const projects: Project[] = [
  [
    "luckperms",
    "LuckPerms",
    "A permissions plugin that grows with your community.",
    "lucko",
    2787724,
    "management",
  ],
  [
    "spark",
    "spark",
    "Find the cause of lag with a lightweight performance profiler.",
    "lucko",
    5108342,
    "optimization",
  ],
  [
    "chunky",
    "Chunky",
    "Pre-generate chunks, one beautifully smooth world at a time.",
    "pop4959",
    8632540,
    "worldgen",
  ],
  [
    "worldedit",
    "WorldEdit",
    "An in-game map editor for builders with big ideas.",
    "EngineHub",
    6453981,
    "utility",
  ],
  [
    "bluemap",
    "BlueMap",
    "Your Minecraft world, rendered as a detailed 3D map.",
    "BlueMap",
    845396,
    "worldgen",
  ],
  [
    "simple-voice-chat",
    "Simple Voice Chat",
    "Hear your friends around you with proximity voice chat.",
    "henkelmax",
    42354819,
    "social",
  ],
].map(([id, title, description, author, downloads, category]) => ({
  project_id: String(id),
  slug: String(id),
  title: String(title),
  description: String(description),
  author: String(author),
  downloads: Number(downloads),
  icon_url: null,
  categories: [String(category)],
}));
const backups: Backup[] = [0, 1, 2].map((i) => ({
  id: `backup-${i}`,
  server_id: "oakheart",
  name: `oakheart-${new Date((now - i * 86400 - 120) * 1000).toISOString().slice(0, 10)}.tar.gz`,
  size: (1.24 - i * 0.03) * gi,
  sha256: "a589a27e6b13f528d8caa5a3ae107d911aa1b8a389216722f56cd948c1dab148",
  created_at: now - i * 86400 - 120,
  destination: i === 1 ? "gdrive" : "local",
  remote_state: i === 1 ? "uploaded" : "local",
}));
export const demoLogs = `[14:02:31 INFO]: Starting minecraft server version 1.21.1
[14:02:31 INFO]: Loading properties
[14:02:31 INFO]: This server is running Paper 1.21.1-132 (MC: 1.21.1)
[14:02:32 INFO]: Server Ping Player Sample Count: 12
[14:02:32 INFO]: Using 4 threads for Netty based IO
[14:02:32 INFO]: [LuckPerms] Loading server plugin LuckPerms v5.4.151
[14:02:32 INFO]: [spark] Loading server plugin spark v1.10.119
[14:02:32 INFO]: [Chunky] Loading server plugin Chunky v1.4.28
[14:02:33 INFO]: Preparing level "world"
[14:02:33 INFO]: Preparing start region for dimension minecraft:overworld
[14:02:34 INFO]: Time elapsed: 1,146 ms
[14:02:34 INFO]: [LuckPerms] Successfully enabled. (took 329ms)
[14:02:34 INFO]: [spark] Starting background profiler...
[14:02:34 INFO]: Done (3.481s)! For help, type "help"
[14:08:41 INFO]: BuilderBee joined the game
[14:08:41 INFO]: [Server] Welcome home, BuilderBee!
[14:12:09 INFO]: Alex joined the game
[14:12:09 INFO]: [Server] Welcome home, Alex!
[14:20:00 INFO]: Saving the game (this may take a moment!)
[14:20:00 INFO]: Saved the game
[14:20:02 INFO]: Automatic saving is now enabled
[14:22:18 INFO]: [BlueMap] All maps are up-to-date.`;

export function demoReply(path: string): unknown {
  const url = new URL(path, "http://demo.local");
  const route = url.pathname;
  if (route === "/api/auth/me")
    return {
      user: {
        id: "demo",
        name: "Builder",
        role: "admin",
        server_ids: ["*"],
        permissions: ["admin"],
      },
      assistant_configured: false,
      version,
    };
  if (route === "/api/overview") return overview;
  if (route === "/api/servers") return { servers: demoServers };
  if (route === "/api/nodes") return { nodes: [node] };
  if (route === "/api/templates") return { templates: demoTemplates };
  if (route === "/api/tokens")
    return {
      tokens: [
        {
          id: "mod-team",
          name: "Community moderators",
          role: "operator",
          server_ids: ["oakheart"],
          permissions: [
            "server.read",
            "server.power",
            "console.read",
            "console.write",
          ],
          expires_at: null,
          created_at: now - 86400 * 5,
        },
      ],
    };
  if (route === "/api/catalog/versions")
    return {
      versions: ["1.21.4", "1.21.3", "1.21.1", "1.20.6", "1.20.4", "1.20.1"],
    };
  if (route === "/api/catalog/loaders")
    return { versions: ["132", "131", "130"] };
  if (route === "/api/catalog/search")
    return {
      hits: projects.filter((p) =>
        `${p.title} ${p.description}`
          .toLowerCase()
          .includes((url.searchParams.get("q") || "").toLowerCase()),
      ),
      total_hits: projects.length,
    };
  if (route.startsWith("/api/catalog/project/"))
    return {
      versions: [
        {
          id: "demo-version",
          project_id: route.split("/").at(-1),
          name: "Latest compatible release",
          version_number: "5.4.151",
          version_type: "release",
          date_published: new Date(now * 1000).toISOString(),
          dependencies: [],
        },
      ],
    };
  if (route === "/api/catalog/github")
    return {
      releases: [],
      compatibility:
        "GitHub source browsing is available in your connected workspace.",
    };
  const parts = route.split("/");
  const server = demoServers.find((s) => s.id === parts[3]);
  if (server && parts.length === 4) return server;
  if (server) {
    switch (parts[4]) {
      case "logs":
        return { text: demoLogs };
      case "packages":
        return {
          packages:
            server.template === "fabric"
              ? packages.slice(0, 3).map((p) => ({
                  ...p,
                  kind: "mod",
                  path: p.path.replace("plugins/", "mods/"),
                }))
              : packages,
        };
      case "backups":
        return {
          backups: backups.map((b) => ({ ...b, server_id: server.id })),
          destinations: ["local", "gdrive"],
        };
      case "tasks":
        return { tasks: demoTasks.filter((t) => t.server_id === server.id) };
      case "jobs":
        return { jobs: [] };
      case "analysis":
        return { findings: [], error_lines: [] };
      case "scan":
        return {
          at: now - 3600,
          jars: packages.map((p) => ({
            path: p.path,
            sha256: p.metadata?.sha256,
            findings: p.name.startsWith("spark")
              ? [
                  {
                    severity: "info",
                    title: "Outbound network access",
                    detail:
                      "Used to share profiler reports. Networking APIs alone are not a sign of malware.",
                    evidence: ["me/lucko/spark/common/SparkPlatform.class"],
                  },
                ]
              : [],
            scanned_entries: 246,
          })),
          verdict: "Static review, not an antivirus guarantee",
        };
      case "files": {
        const dir = url.searchParams.get("path") || "/";
        const names =
          dir === "/" || dir === "."
            ? [
                "world/",
                "world_nether/",
                "world_the_end/",
                "plugins/",
                "config/",
                "logs/",
                "server.properties",
                "eula.txt",
                "bukkit.yml",
                "spigot.yml",
                "whitelist.json",
                "ops.json",
              ]
            : dir.includes("plugins")
              ? packages.map((p) => p.name)
              : ["level.dat", "session.lock", "region/"];
        return {
          entries: names.map((name, i) => ({
            name: name.replace("/", ""),
            path: `${dir.replace(/\/$/, "")}/${name.replace("/", "")}`,
            is_dir: name.endsWith("/"),
            size: name.endsWith("/") ? 0 : 682 + i * 142,
            modified: now - 3600 * i,
          })),
        };
      }
      case "file":
        return {
          path: url.searchParams.get("path"),
          content:
            "# Minecraft server properties\n# Managed with Emberdeck\n\nmotd=A little place to build something great.\nmax-players=50\ndifficulty=normal\ngamemode=survival\nview-distance=10\nsimulation-distance=8\npvp=true\nonline-mode=true\nwhite-list=false\n",
          encoding: "utf8",
          sha256: "demo-file-checksum",
          size: 258,
        };
    }
  }
  throw new Error(`Demo resource is unavailable: ${route}`);
}
