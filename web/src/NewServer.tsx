import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Cpu,
  Info,
  Rocket,
  Server,
} from "lucide-react";
import { post, useApi } from "./api";
import type { GameServer, Node, Template } from "./types";
import { useWorkspace } from "./context";
import { Button, ErrorBox, Modal, pretty } from "./ui";

export function NewServer({
  initialTemplate,
  initialModpack = "",
  initialVersion = "",
  onClose,
}: {
  initialTemplate: string;
  initialModpack?: string;
  initialVersion?: string;
  onClose: () => void;
}) {
  const { servers, notify, refresh, navigate, runAction } = useWorkspace();
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState(initialTemplate);
  const [version, setVersion] = useState(initialVersion);
  const [loader, setLoader] = useState("");
  const [name, setName] = useState("");
  const [node, setNode] = useState("local");
  const [memory, setMemory] = useState(2048);
  const [cpu, setCpu] = useState(2);
  const [disk, setDisk] = useState(32);
  const [port, setPort] = useState(
    Math.max(25564, ...servers.map((s) => s.port)) + 1,
  );
  const [modpack, setModpack] = useState(initialModpack);
  const [eula, setEula] = useState(false);
  const [start, setStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const templates = useApi<{ templates: Template[] }>("/api/templates");
  const nodes = useApi<{ nodes: Node[] }>("/api/nodes");
  const versions = useApi<{ versions: string[] }>(
    `/api/catalog/versions?template=${template}`,
  );
  const selectedVersion = version || versions.data?.versions[0] || "";
  const loaders = useApi<{ versions: string[] }>(
    selectedVersion
      ? `/api/catalog/loaders?template=${template}&version=${encodeURIComponent(selectedVersion)}`
      : null,
  );
  const family = templates.data?.templates.find(
    (t) => t.id === template,
  )?.family;
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const server = await post<GameServer>("/api/servers", {
        name,
        node_id: node,
        template,
        version: selectedVersion,
        loader_version: loader,
        memory_mb: memory,
        cpu_limit: cpu,
        disk_mb: disk * 1024,
        port,
        max_players: 20,
        motd: "A world worth building. Powered by Emberdeck.",
        java: null,
        modpack: modpack || null,
        environment: {},
        accept_eula: eula,
      });
      refresh();
      notify(`${server.name} is ready to set up.`);
      onClose();
      navigate(`/servers/${server.id}/console`);
      if (start)
        await runAction(server.id, { action: "power", signal: "start" });
    } catch (error) {
      setError(
        error instanceof Error ? error : new Error("Could not create server"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="A new world is waiting."
      subtitle="Choose your foundation. We'll take care of the setup."
      onClose={onClose}
      wide
    >
      <div className="wizard-steps">
        {["Blueprint", "Resources", "Launch"].map((label, i) => (
          <span key={label} className={step === i ? "active" : ""}>
            <b>{step > i ? <Check size={12} /> : i + 1}</b>
            {label}
            {i < 2 && <ArrowRight size={12} />}
          </span>
        ))}
      </div>
      <ErrorBox error={error || templates.error || nodes.error} />
      {step === 0 && (
        <div className="form-stack">
          <div className="blueprint-grid wizard-blueprints">
            {templates.data?.templates.map((t) => (
              <button
                key={t.id}
                className={`blueprint-card ${t.family} ${template === t.id ? "selected" : ""}`}
                onClick={() => {
                  setTemplate(t.id);
                  setVersion("");
                  setLoader("");
                  setModpack("");
                }}
              >
                <span className="blueprint-icon">{t.name[0]}</span>
                <span>
                  <h3>{t.name}</h3>
                  <small>
                    {t.family === "hybrid" ? "Mods + plugins" : t.family}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Minecraft version
              <select
                value={selectedVersion}
                onChange={(e) => {
                  setVersion(e.target.value);
                  setLoader("");
                }}
                disabled={versions.loading}
              >
                <option value="" disabled>
                  {versions.loading
                    ? "Fetching published versions…"
                    : "Choose a version"}
                </option>
                {versions.data?.versions.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Core / loader build
              <select
                value={loader}
                onChange={(e) => setLoader(e.target.value)}
              >
                <option value="">Latest compatible build</option>
                {loaders.data?.versions.map((v, i) => (
                  <option key={`${v}-${i}`} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ErrorBox
            error={versions.error || loaders.error}
            retry={() => {
              void versions.refresh();
              void loaders.refresh();
            }}
          />
          {family === "mods" && (
            <label>
              Modrinth modpack (optional)
              <input
                value={modpack}
                onChange={(e) => setModpack(e.target.value)}
                placeholder="Project ID or slug, e.g. fabulously-optimized"
              />
              <small>
                The node resolves the pack for this Minecraft version and
                loader.
              </small>
            </label>
          )}
          {family === "hybrid" && (
            <div className="notice orange">
              <Info size={16} />
              <span>
                Hybrid compatibility is experimental. Verify each mod and plugin
                against your exact Arclight build.
              </span>
            </div>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="form-stack">
          <div className="form-grid">
            <label>
              Server name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your next great adventure"
                maxLength={80}
                required
              />
            </label>
            <label>
              Host node
              <select value={node} onChange={(e) => setNode(e.target.value)}>
                {nodes.data?.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <div className="resource-slider">
              <div>
                <span>
                  <Server size={12} /> Memory limit
                </span>
                <strong>{memory / 1024} GiB</strong>
              </div>
              <input
                aria-label="Memory limit"
                type="range"
                min="1024"
                max="16384"
                step="512"
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
              />
            </div>
            <div className="resource-slider">
              <div>
                <span>
                  <Cpu size={12} /> CPU limit
                </span>
                <strong>{cpu} cores</strong>
              </div>
              <input
                aria-label="CPU limit"
                type="range"
                min="0.5"
                max="8"
                step="0.5"
                value={cpu}
                onChange={(e) => setCpu(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="form-grid">
            <label>
              Game port
              <input
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </label>
            <label>
              Disk budget (GiB)
              <input
                type="number"
                min={1}
                max={16384}
                value={disk}
                onChange={(e) => setDisk(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="notice">
            <Info size={16} />
            <span>
              CPU and memory are hard Docker limits. Disk is a monitored budget.
              Java is selected automatically for your Minecraft version.
            </span>
          </div>
        </div>
      )}
      {step === 2 && (
        <>
          <div className="summary-grid">
            {[
              ["Server", name],
              ["Blueprint", `${pretty(template)} · ${selectedVersion}`],
              ["Memory", `${memory / 1024} GiB`],
              ["CPU", `${cpu} cores`],
              ["Game port", String(port)],
              ["Disk budget", `${disk} GiB`],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="form-stack">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
              />
              <span>
                I have read and accept the{" "}
                <a
                  href="https://www.minecraft.net/eula"
                  target="_blank"
                  rel="noreferrer"
                >
                  Minecraft End User License Agreement
                </a>
                .
              </span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={start}
                onChange={(e) => setStart(e.target.checked)}
              />
              Start the server after creating it.
            </label>
            <div className="notice">
              <Box size={16} />
              <span>
                The first start downloads a Java runtime and the selected core.
                Progress and any errors appear in the live console.
              </span>
            </div>
          </div>
        </>
      )}
      <div className="modal-actions">
        <span>STEP {step + 1} OF 3</span>
        {step > 0 && (
          <Button disabled={busy} onClick={() => setStep(step - 1)}>
            <ArrowLeft size={14} />
            Back
          </Button>
        )}
        {step < 2 ? (
          <Button
            variant="primary"
            disabled={
              step === 0
                ? !selectedVersion || !!versions.error
                : !name.trim() || !node || port < 1024 || disk < 1
            }
            onClick={() => setStep(step + 1)}
          >
            Continue
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button
            variant="primary"
            busy={busy}
            disabled={!eula}
            onClick={() => void create()}
          >
            <Rocket size={15} />
            Create server
          </Button>
        )}
      </div>
    </Modal>
  );
}
