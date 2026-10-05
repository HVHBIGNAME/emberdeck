import { useState } from "react";
import {
  Download,
  Github,
  Info,
  PackagePlus,
  Puzzle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, useApi, useDebounce } from "./api";
import { useWorkspace } from "./context";
import type { GameServer, Project, ProjectVersion } from "./types";
import {
  AnimatePresence,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  Select,
  bytes,
  pretty,
} from "./ui";
import { locale, useTranslation } from "./i18n";
import { motion } from "motion/react";
import { usePreferences } from "./Preferences";

interface Release {
  id: number;
  name: string;
  tag_name: string;
  prerelease: boolean;
  assets: { id: number; name: string; size: number }[];
}
export function LibraryPage({ server: fixedServer }: { server?: GameServer }) {
  const { t } = useTranslation();
  const { motion: animated } = usePreferences();
  const { servers, runAction, can, notify, newServer } = useWorkspace();
  const [selectedServer, setSelectedServer] = useState(
    fixedServer?.id || servers[0]?.id || "",
  );
  const [query, setQuery] = useState("");
  const search = useDebounce(query);
  const [kind, setKind] = useState("plugin");
  const [source, setSource] = useState("modrinth");
  const [project, setProject] = useState<Project | null>(null);
  const [repository, setRepository] = useState("");
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubError, setGithubError] = useState<Error | null>(null);
  const [asset, setAsset] = useState<{ id: number; name: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const target =
    fixedServer || servers.find((s) => s.id === selectedServer) || servers[0];
  const choices =
    target?.template === "arclight"
      ? ["plugin", "mod"]
      : ["fabric", "forge", "neoforge", "quilt"].includes(
            target?.template || "",
          )
        ? ["mod", "modpack"]
        : target?.template === "vanilla"
          ? []
          : ["plugin"];
  const effectiveKind = choices.includes(kind) ? kind : choices[0];
  const results = useApi<{ hits: Project[]; total_hits: number }>(
    target && effectiveKind && source === "modrinth"
      ? `/api/catalog/search?server_id=${target.id}&kind=${effectiveKind}&q=${encodeURIComponent(search)}`
      : null,
  );
  if (!target)
    return (
      <Empty
        icon={<Puzzle />}
        title="Give your library a home"
        description="Create a Minecraft server first. The library automatically filters packages by its game version and loader."
      />
    );
  return (
    <>
      {!fixedServer && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">{t("MAKE IT YOUR OWN")}</span>
            <h1>
              {t("A world of possibilities")}
              <span className="orange-text">.</span>
            </h1>
            <p>{t("Discover packages that belong on your server.")}</p>
          </div>
          <span className="tag">{t("LIVE PROVIDER CATALOG")}</span>
        </div>
      )}
      <div className="toolbar">
        {!fixedServer && (
          <div className="select-server">
            <Puzzle size={15} />
            <Select
              label={t("Target server")}
              value={target.id}
              onValueChange={setSelectedServer}
              options={servers.map((server) => ({
                value: server.id,
                label: server.name,
              }))}
            />
          </div>
        )}
        <div className="segment">
          {["modrinth", "github"].map((s) => (
            <button
              key={s}
              className={source === s ? "active" : ""}
              onClick={() => setSource(s)}
            >
              {s === "modrinth" ? "Modrinth" : "GitHub"}
            </button>
          ))}
        </div>
        {choices.length > 1 && (
          <div className="segment">
            {choices.map((k) => (
              <button
                key={k}
                className={effectiveKind === k ? "active" : ""}
                onClick={() => setKind(k)}
              >
                {t(
                  k === "mod"
                    ? "Mods"
                    : k === "modpack"
                      ? "Modpacks"
                      : "Plugins",
                )}
              </button>
            ))}
          </div>
        )}
        {source === "modrinth" && choices.length > 0 && (
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label={t("Search packages")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(`Search ${effectiveKind}s…`)}
            />
          </div>
        )}
      </div>
      <div className="compatibility">
        <ShieldCheck size={14} />
        {source === "modrinth"
          ? t(
              "Filtered for {{core}} · Minecraft {{version}} · server-side support",
              { core: pretty(target.template), version: target.version },
            )
          : t("GitHub releases require a manual compatibility check.")}
      </div>
      {!choices.length ? (
        <Empty
          icon={<Puzzle />}
          title="Pure Minecraft"
          description="Vanilla doesn't load plugins or mods. Create a Paper or Fabric server to use the package library."
        />
      ) : source === "modrinth" ? (
        <>
          <ErrorBox
            error={results.error}
            retry={() => void results.refresh()}
          />
          {results.loading ? (
            <Loading />
          ) : results.data?.hits.length ? (
            <div className="package-grid">
              <AnimatePresence>
                {results.data.hits.map((p, index) => (
                  <motion.article
                    className="panel package-card"
                    key={p.project_id}
                    layout={animated ? "position" : false}
                    initial={animated ? { opacity: 0, y: 14 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: animated ? 0.22 : 0,
                      delay: animated ? Math.min(index, 5) * 0.035 : 0,
                    }}
                  >
                    <div className="package-heading">
                      <span className="package-avatar">
                        {p.icon_url ? (
                          <img src={p.icon_url} alt="" loading="lazy" />
                        ) : (
                          p.title[0]
                        )}
                      </span>
                      <div>
                        <h3>{p.title}</h3>
                        <small>
                          {t("by {{author}}", { author: p.author })}
                        </small>
                      </div>
                    </div>
                    <p>
                      {p.description.slice(0, 155)}
                      {p.description.length > 155 && "…"}
                    </p>
                    <div className="package-tags">
                      {p.categories
                        .filter(
                          (c) =>
                            ![
                              "bukkit",
                              "spigot",
                              "paper",
                              "fabric",
                              "forge",
                              "neoforge",
                              "folia",
                              "quilt",
                              "purpur",
                              "velocity",
                              "bungeecord",
                              "waterfall",
                            ].includes(c),
                        )
                        .slice(0, 3)
                        .map((c) => (
                          <span key={c} className="tag">
                            {c}
                          </span>
                        ))}
                    </div>
                    <footer>
                      <span>
                        <Download size={12} />
                        {Intl.NumberFormat(locale(), {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(p.downloads)}
                      </span>
                      <Button
                        onClick={() =>
                          effectiveKind === "modpack"
                            ? newServer(target.template, p.slug, target.version)
                            : setProject(p)
                        }
                        disabled={
                          !can(
                            effectiveKind === "modpack"
                              ? "admin"
                              : "packages.write",
                            target.id,
                          )
                        }
                      >
                        <PackagePlus size={13} />
                        {t(
                          effectiveKind === "modpack"
                            ? "Create server"
                            : "Install",
                        )}
                      </Button>
                    </footer>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <Empty
              icon={<Search />}
              title="No compatible packages found"
              description="Try another search. Only packages explicitly supporting this game version and loader are shown."
            />
          )}
        </>
      ) : (
        <>
          <form
            className="toolbar"
            onSubmit={async (event) => {
              event.preventDefault();
              setGithubBusy(true);
              setGithubError(null);
              try {
                const result = await api<{ releases: Release[] }>(
                  `/api/catalog/github?repository=${encodeURIComponent(repository)}`,
                );
                setReleases(result.releases);
              } catch (error) {
                setGithubError(
                  error instanceof Error
                    ? error
                    : new Error("GitHub lookup failed"),
                );
              } finally {
                setGithubBusy(false);
              }
            }}
          >
            <div className="search-field">
              <Github size={17} />
              <input
                aria-label={t("GitHub repository")}
                placeholder="owner/repository"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                required
              />
            </div>
            <Button type="submit" busy={githubBusy}>
              {t("Find releases")}
            </Button>
          </form>
          <ErrorBox error={githubError} />
          <div className="notice orange">
            <Info size={16} />
            <span>
              {t(
                "GitHub doesn't declare Minecraft or loader compatibility. Check the release notes before installing. Only JAR assets are accepted; publisher checksums are verified when available.",
              )}
            </span>
          </div>
          <div style={{ height: 20 }} />
          {releases?.map((release) => (
            <section
              className="panel"
              key={release.id}
              style={{ marginBottom: 15 }}
            >
              <header className="panel-heading">
                <h2>{release.name || release.tag_name}</h2>
                <span className="tag">
                  {release.prerelease ? t("Pre-release") : release.tag_name}
                </span>
              </header>
              <div className="activity-list">
                {release.assets
                  .filter((a) => a.name.endsWith(".jar"))
                  .map((a) => (
                    <div className="activity-row" key={a.id}>
                      <PackagePlus size={17} />
                      <div>
                        <strong>{a.name}</strong>
                        <span>{bytes(a.size)}</span>
                      </div>
                      <Button
                        style={{ marginLeft: "auto" }}
                        onClick={() => {
                          setAsset(a);
                          setConfirmed(false);
                        }}
                        disabled={!can("packages.write", target.id)}
                      >
                        {t("Install")}
                      </Button>
                    </div>
                  ))}
              </div>
            </section>
          ))}
          {releases?.length === 0 && (
            <Empty
              icon={<Github />}
              title="No releases found"
              description="Use a public repository that publishes JAR release assets."
            />
          )}
        </>
      )}
      <AnimatePresence>
        {project && (
          <InstallProject
            key="modrinth-install"
            project={project}
            server={target}
            kind={effectiveKind}
            onClose={() => setProject(null)}
          />
        )}
        {asset && (
          <Modal
            key="github-install"
            title="Install a GitHub release"
            subtitle={asset.name}
            onClose={() => setAsset(null)}
          >
            <div className="notice">
              <Github size={17} />
              <span>
                {repository}
                <br />
                {t("Target:")} {target.name} · {pretty(target.template)}{" "}
                {target.version}
              </span>
            </div>
            <div style={{ height: 20 }} />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t(
                "I've checked that this release supports my Minecraft version and loader.",
              )}
            </label>
            <div className="modal-actions">
              <Button onClick={() => setAsset(null)}>{t("Cancel")}</Button>
              <Button
                variant="primary"
                disabled={!confirmed}
                onClick={async () => {
                  const result = await runAction(target.id, {
                    action: "install_github",
                    repository,
                    asset_id: asset.id,
                    kind: effectiveKind,
                    confirm_compatibility: true,
                  });
                  if (result) {
                    setAsset(null);
                    notify(
                      "Installation queued. Review its result before restarting.",
                    );
                  }
                }}
              >
                {t("Install release")}
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

function InstallProject({
  project,
  server,
  kind,
  onClose,
}: {
  project: Project;
  server: GameServer;
  kind: string;
  onClose: () => void;
}) {
  const { runAction } = useWorkspace();
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const versions = useApi<{ versions: ProjectVersion[] }>(
    `/api/catalog/project/${project.project_id}?server_id=${server.id}&kind=${kind}`,
  );
  const chosen = version || versions.data?.versions[0]?.id || "";
  const selected = versions.data?.versions.find((v) => v.id === chosen);
  return (
    <Modal
      title={t("Install {{name}}", { name: project.title })}
      subtitle={`${server.name} · ${pretty(server.template)} ${server.version}`}
      onClose={onClose}
    >
      <div className="form-stack">
        <p>{project.description}</p>
        <ErrorBox error={versions.error} />
        {versions.loading ? (
          <Loading />
        ) : (
          <label>
            {t("Compatible version")}
            <Select
              label={t("Compatible version")}
              value={chosen}
              onValueChange={setVersion}
              options={(versions.data?.versions || []).map((version) => ({
                value: version.id,
                label: `${version.name} · ${t(version.version_type)}`,
              }))}
            />
          </label>
        )}
        <div className="notice">
          <ShieldCheck size={16} />
          <span>
            {t(
              "Downloads are verified against Modrinth's SHA-512 checksum. Required dependencies are resolved for the same loader and Minecraft version.",
            )}
            {selected && (
              <>
                <br />
                {t("Required dependencies: {{count}}", {
                  count: selected.dependencies.filter(
                    (d) => d.dependency_type === "required",
                  ).length,
                })}
              </>
            )}
          </span>
        </div>
        <p>
          {t(
            "A restart is required after installation. Compatibility metadata and static checks are not a guarantee of safety.",
          )}
        </p>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>{t("Cancel")}</Button>
        <Button
          variant="primary"
          busy={busy}
          disabled={!chosen}
          onClick={async () => {
            setBusy(true);
            const result = await runAction(server.id, {
              action: "install_package",
              project_id: project.project_id,
              version_id: chosen,
              kind,
            });
            setBusy(false);
            if (result) onClose();
          }}
        >
          <Download size={14} />
          {t("Install package")}
        </Button>
      </div>
    </Modal>
  );
}
