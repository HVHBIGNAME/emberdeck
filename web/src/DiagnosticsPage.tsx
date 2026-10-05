import { useState } from "react";
import {
  Activity,
  Bug,
  CheckCircle2,
  FileSearch,
  Info,
  Play,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { useApi } from "./api";
import { useWorkspace } from "./context";
import type { GameServer, Scan } from "./types";
import { AnimatePresence, Button, ErrorBox, Loading, Modal, date } from "./ui";
import { useTranslation } from "./i18n";

interface Analysis {
  findings: {
    signature: string;
    title: string;
    advice: string;
    evidence: string[];
  }[];
  error_lines: string[];
}
export function DiagnosticsPage({ server }: { server: GameServer }) {
  const { t } = useTranslation();
  const { runAction, can } = useWorkspace();
  const [osv, setOsv] = useState(false);
  const [diagnose, setDiagnose] = useState(false);
  return (
    <>
      <div className="diagnostic-grid">
        <section className="panel diagnostic-card">
          <h2>
            <ShieldCheck size={20} className="blue-text" />
            {t("Know what you're running.")}
          </h2>
          <p>
            {t(
              "Inspect JAR metadata, integrity changes, and potentially risky bytecode references. No plugin code is executed during this review.",
            )}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={osv}
              onChange={(e) => setOsv(e.target.checked)}
            />
            <span>
              {t("Check embedded Maven dependencies with OSV.")}
              <br />
              {t("Sends package coordinates and versions to osv.dev.")}
            </span>
          </label>
          <Button
            disabled={!can("diagnostics.write", server.id)}
            onClick={() =>
              void runAction(server.id, {
                action: "scan",
                check_vulnerabilities: osv,
              })
            }
          >
            <ScanLine size={15} />
            {t("Review installed JARs")}
          </Button>
        </section>
        <section className="panel diagnostic-card">
          <h2>
            <Bug size={20} className="orange-text" />
            {t("Find the one that breaks it.")}
          </h2>
          <p>
            {t(
              "Reproduce startup in an isolated clone, then narrow down failing plugin or mod groups. Declared hard dependencies stay together.",
            )}
          </p>
          <p style={{ marginTop: 12 }}>
            {t(
              "The original server must be stopped. Tests use a separate container and publish no game port.",
            )}
          </p>
          <Button
            disabled={!can("diagnostics.write", server.id)}
            onClick={() => setDiagnose(true)}
          >
            <Activity size={15} />
            {t("Start isolated diagnosis")}
          </Button>
        </section>
      </div>
      <LogAnalysis serverId={server.id} />
      <JarReview serverId={server.id} />
      <AnimatePresence>
        {diagnose && (
          <DiagnosisDialog server={server} onClose={() => setDiagnose(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function LogAnalysis({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { revision } = useWorkspace();
  const analysis = useApi<Analysis>(
    `/api/servers/${serverId}/analysis`,
    15000,
    revision,
  );
  return (
    <section className="panel" style={{ marginTop: 22 }}>
      <header className="panel-heading">
        <div>
          <h2>{t("What the logs are saying")}</h2>
          <p>{t("Local pattern analysis · no AI provider required")}</p>
        </div>
        <FileSearch size={20} className="muted" />
      </header>
      <div style={{ padding: "0 22px 20px" }}>
        <ErrorBox error={analysis.error} />
        {analysis.loading ? (
          <Loading />
        ) : analysis.data?.findings.length ? (
          analysis.data.findings.map((f) => (
            <div className="finding" key={f.signature}>
              <h3>{t(f.title)}</h3>
              <p>{t(f.advice)}</p>
              {f.evidence.map((line, i) => (
                <code key={i}>{line}</code>
              ))}
            </div>
          ))
        ) : (
          <div className="notice">
            <CheckCircle2 size={17} />
            <span>
              {t(
                "No recognized error patterns in the recent log. This is a limited check, not a complete health assessment.",
              )}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function JarReview({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { revision } = useWorkspace();
  const scan = useApi<Scan>(`/api/servers/${serverId}/scan`, 6000, revision);
  return (
    <section className="panel" style={{ marginTop: 22 }}>
      <header className="panel-heading">
        <div>
          <h2>{t("JAR review")}</h2>
          <p>
            {scan.data?.at
              ? t("Last checked {{date}}", { date: date(scan.data.at) })
              : t("No review has been run yet")}
          </p>
        </div>
        <span className="tag">{t("STATIC ANALYSIS")}</span>
      </header>
      <ErrorBox error={scan.error} />
      {scan.data?.at && (
        <>
          <div className="scan-summary">
            <ShieldCheck size={15} />
            <span>
              {t(
                "JARs reviewed: {{jars}} · findings for human review: {{findings}}",
                {
                  jars: scan.data.jars.length,
                  findings: scan.data.jars.reduce(
                    (sum, jar) => sum + jar.findings.length,
                    0,
                  ),
                },
              )}
            </span>
          </div>
          <div className="scan-results">
            {scan.data.jars.map((jar) => (
              <div className="scan-jar" key={jar.path}>
                <div>
                  <FileSearch size={14} />
                  <span className="mono">{jar.path}</span>
                  <span className="tag">
                    {jar.findings.length
                      ? t("Findings: {{count}}", { count: jar.findings.length })
                      : t("No flagged patterns")}
                  </span>
                </div>
                {jar.findings.map((finding, i) => (
                  <div className={`finding ${finding.severity}`} key={i}>
                    <h3>{t(finding.title)}</h3>
                    <p>{t(finding.detail)}</p>
                    {finding.evidence.map((e, index) => (
                      <code key={index}>{e}</code>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {scan.data.osv && (
            <div style={{ padding: 20 }}>
              <h3>{t("OSV dependency results")}</h3>
              {scan.data.osv.results.map((result, i) => (
                <div
                  key={i}
                  className={`finding ${result.vulns?.length ? "high" : "info"}`}
                >
                  <h3>{scan.data?.osv?.coordinates[i]?.join(" · ")}</h3>
                  <p>
                    {result.vulns?.length
                      ? result.vulns.map((v) => v.id).join(", ")
                      : t(
                          "No matching advisories returned for this coordinate.",
                        )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <p className="quiet">
        {t(
          "Static checks can miss threats and flag legitimate functionality. Nested JARs, native binaries, and downloaded code are outside this scanner's coverage.",
        )}
      </p>
    </section>
  );
}

function DiagnosisDialog({
  server,
  onClose,
}: {
  server: GameServer;
  onClose: () => void;
}) {
  const { runAction } = useWorkspace();
  const { t } = useTranslation();
  const [signature, setSignature] = useState("");
  const [timeout, setTimeoutValue] = useState(120);
  const [trials, setTrials] = useState(16);
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const stopped = ["offline", "crashed"].includes(server.snapshot.state);
  return (
    <Modal
      title="Reproduce. Narrow down. Understand."
      subtitle={t("An isolated startup check using a clone of this server.")}
      onClose={onClose}
    >
      <div className="form-stack">
        {!stopped && (
          <ErrorBox error="Stop the original server before starting diagnosis." />
        )}
        <label>
          {t("Error signature (optional)")}
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={t("Exact error text from the log")}
            maxLength={500}
          />
          <small>
            {t(
              "A literal text match. Without a signature, the check detects failed startup.",
            )}
          </small>
        </label>
        <div className="form-grid">
          <label>
            {t("Timeout per trial (seconds)")}
            <input
              type="number"
              min={30}
              max={600}
              value={timeout}
              onChange={(e) => setTimeoutValue(Number(e.target.value))}
            />
          </label>
          <label>
            {t("Maximum trials")}
            <input
              type="number"
              min={4}
              max={64}
              value={trials}
              onChange={(e) => setTrials(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={apply}
            onChange={(e) => setApply(e.target.checked)}
          />
          <span>
            {t(
              "Apply a verified fix: make a backup, then rename the failing JARs to",
            )}{" "}
            <code>.jar.disabled</code>.
          </span>
        </label>
        <div className="notice orange">
          <Info size={17} />
          <span>
            {t(
              "Only applied if removing the identified group produces a healthy startup and the original JAR hashes are unchanged. Runtime-only problems need a separate reproduction. The clone needs enough disk space and memory to boot.",
            )}
          </span>
        </div>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>{t("Cancel")}</Button>
        <Button
          variant="primary"
          busy={busy}
          disabled={!stopped}
          onClick={async () => {
            setBusy(true);
            const result = await runAction(server.id, {
              action: "diagnose",
              error_text: signature,
              timeout_secs: timeout,
              max_trials: trials,
              apply_fix: apply,
            });
            setBusy(false);
            if (result) onClose();
          }}
        >
          <Play size={14} />
          {t("Run diagnosis")}
        </Button>
      </div>
    </Modal>
  );
}
