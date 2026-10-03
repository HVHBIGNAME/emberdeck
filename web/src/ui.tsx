import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertCircle, Check, Copy, LoaderCircle, X } from "lucide-react";
import { publicFile } from "./assets";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? "small" : ""}`}>
      <img src={publicFile("mark.svg")} alt="" />
      {!small && (
        <span>
          emberdeck<span className="logo-dot">.</span>
        </span>
      )}
    </span>
  );
}
export function Button({
  children,
  variant = "secondary",
  busy = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${className}`}
    >
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  initialFocus,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  initialFocus?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    if (initialFocus)
      element?.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => element?.close();
  }, [initialFocus]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      <div className="modal-inner">
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: Error | string | null;
  retry?: () => void;
}) {
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{typeof error === "string" ? error : error.message}</span>
      {retry && <Button onClick={retry}>Retry</Button>}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Badge({ state }: { state: string }) {
  return (
    <span className={`status ${state}`}>
      <span className="status-dot" />
      {state.charAt(0).toUpperCase() + state.slice(1)}
    </span>
  );
}
export function Progress({
  value,
  color = "orange",
  label = "Resource usage",
}: {
  value: number;
  color?: string;
  label?: string;
}) {
  return (
    <progress
      className={`progress ${color}`}
      aria-label={label}
      value={Math.max(0, Math.min(100, value))}
      max={100}
    />
  );
}
export function CopyButton({
  value,
  label = "Copy",
  showLabel = false,
}: {
  value: string;
  label?: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1800);
      return () => clearTimeout(t);
    }
  }, [copied]);
  return (
    <button
      className={showLabel ? "button primary" : "icon-button"}
      title={
        error
          ? "Clipboard requires HTTPS or localhost"
          : copied
            ? "Copied"
            : label
      }
      aria-label={copied ? "Copied" : label}
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setError(false);
        } catch {
          setError(true);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {showLabel && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
export function bytes(value: number, decimals = 1) {
  if (value < 1024) return `${value} B`;
  const unit = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** unit).toFixed(decimals)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}
export function ago(timestamp: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  return seconds < 60
    ? "just now"
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
}
export function date(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export const pretty = (name: string) =>
  ({
    neoforge: "NeoForge",
    paper: "Paper",
    fabric: "Fabric",
    forge: "Forge",
    purpur: "Purpur",
    folia: "Folia",
    quilt: "Quilt",
    vanilla: "Vanilla",
    arclight: "Arclight",
  })[name] || name;
export function world(server: { id: string; template: string }) {
  if (server.id === "workshop") return "creative";
  return ["fabric", "quilt"].includes(server.template)
    ? "alpine"
    : ["neoforge", "forge", "arclight"].includes(server.template)
      ? "cavern"
      : "overworld";
}
export function saveFile(name: string, content: BlobPart, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
