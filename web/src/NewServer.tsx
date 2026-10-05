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
import { Button, ErrorBox, Modal, Select, pretty } from "./ui";
import { useTranslation } from "./i18n";
import { AnimatePresence, motion } from "motion/react";
import { usePreferences } from "./Preferences";

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
  const { t: tr } = useTranslation();
  const { motion: animated } = usePreferences();
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
      notify(tr("{{name}} is ready to set up.", { name: server.name }));
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
      subtitle={tr("Choose your foundation. We'll take care of the setup.")}
      onClose={onClose}
      wide
    >
      <div className="wizard-steps">
        {["Blueprint", "Resources", "Launch"].map((label, i) => (
          <span key={label} className={step === i ? "active" : ""}>
            <b>{step > i ? <Check size={12} /> : i + 1}</b>
            {tr(label)}
            {i < 2 && <ArrowRight size={12} />}
          </span>
        ))}
      </div>
      <ErrorBox error={error || templates.error || nodes.error} />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={animated ? { opacity: 0, x: 12 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: animated ? -8 : 0 }}
          transition={{ duration: animated ? 0.18 : 0 }}
        >
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
                        {tr(
                          t.family === "hybrid" ? "Mods + plugins" : t.family,
                        )}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <label>
                  {tr("Minecraft version")}
                  <Select
                    label={tr("Minecraft version")}
                    value={selectedVersion}
                    onValueChange={(value) => {
                      setVersion(value);
                      setLoader("");
                    }}
                    disabled={versions.loading}
                    placeholder={tr(
                      versions.loading
                        ? "Fetching published versions…"
                        : "Choose a version",
                    )}
                    options={(versions.data?.versions || []).map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </label>
                <label>
                  {tr("Core / loader build")}
                  <Select
                    label={tr("Core / loader build")}
                    value={loader}
                    onValueChange={setLoader}
                    options={[
                      { value: "", label: tr("Latest compatible build") },
                      ...[...new Set(loaders.data?.versions || [])].map(
                        (value) => ({ value, label: value }),
                      ),
                    ]}
                  />
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
                  {tr("Modrinth modpack (optional)")}
                  <input
                    value={modpack}
                    onChange={(e) => setModpack(e.target.value)}
                    placeholder={tr(
                      "Project ID or slug, e.g. fabulously-optimized",
                    )}
                  />
                  <small>
                    {tr(
                      "The node resolves the pack for this Minecraft version and loader.",
                    )}
                  </small>
                </label>
              )}
              {family === "hybrid" && (
                <div className="notice orange">
                  <Info size={16} />
                  <span>
                    {tr(
                      "Hybrid compatibility is experimental. Verify each mod and plugin against your exact Arclight build.",
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="form-stack">
              <div className="form-grid">
                <label>
                  {tr("Server name")}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tr("Your next great adventure")}
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  {tr("Host node")}
                  <Select
                    label={tr("Host node")}
                    value={node}
                    onValueChange={setNode}
                    options={(nodes.data?.nodes || []).map((node) => ({
                      value: node.id,
                      label: node.name,
                    }))}
                  />
                </label>
              </div>
              <div className="form-grid">
                <div className="resource-slider">
                  <div>
                    <span>
                      <Server size={12} /> {tr("Memory limit")}
                    </span>
                    <strong>
                      {memory / 1024} {tr("GiB")}
                    </strong>
                  </div>
                  <input
                    aria-label={tr("Memory limit")}
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
                      <Cpu size={12} /> {tr("CPU limit")}
                    </span>
                    <strong>{tr("{{count}} cores", { count: cpu })}</strong>
                  </div>
                  <input
                    aria-label={tr("CPU limit")}
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
                  {tr("Game port")}
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                  />
                </label>
                <label>
                  {tr("Disk budget (GiB)")}
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
                  {tr(
                    "CPU and memory are hard Docker limits. Disk is a monitored budget. Java is selected automatically for your Minecraft version.",
                  )}
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
                  ["Memory", `${memory / 1024} ${tr("GiB")}`],
                  ["CPU", tr("{{count}} cores", { count: cpu })],
                  ["Game port", String(port)],
                  ["Disk budget", `${disk} ${tr("GiB")}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{tr(label)}</span>
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
                    {tr("I have read and accept the")}{" "}
                    <a
                      href="https://www.minecraft.net/eula"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("Minecraft End User License Agreement")}
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
                  {tr("Start the server after creating it.")}
                </label>
                <div className="notice">
                  <Box size={16} />
                  <span>
                    {tr(
                      "The first start downloads a Java runtime and the selected core. Progress and any errors appear in the live console.",
                    )}
                  </span>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="modal-actions">
        <span>{tr("STEP {{step}} OF 3", { step: step + 1 })}</span>
        {step > 0 && (
          <Button disabled={busy} onClick={() => setStep(step - 1)}>
            <ArrowLeft size={14} />
            {tr("Back")}
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
            {tr("Continue")}
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
            {tr("Create server")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
