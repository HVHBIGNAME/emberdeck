import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useIsPresent } from "motion/react";
import { AlertCircle, Check, Copy, LoaderCircle, X } from "lucide-react";
import { publicFile } from "./assets";
import { usePreferences } from "./Preferences";
import i18n, { locale, messageText, useTranslation } from "./i18n";
export { Select } from "./Select";
export { AnimatePresence } from "motion/react";

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
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const descriptionId = useId();
  const present = useIsPresent();
  const { motion: animated } = usePreferences();
  const { t } = useTranslation();
  return (
    <Dialog.Root
      open={present}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal forceMount>
        <Dialog.Overlay asChild forceMount>
          <motion.div
            className="modal-overlay"
            initial={animated ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: animated ? 0.18 : 0 }}
          >
            <Dialog.Content
              asChild
              forceMount
              onCloseAutoFocus={(event) => {
                if (returnFocus.current?.isConnected) {
                  event.preventDefault();
                  returnFocus.current.focus({ preventScroll: true });
                }
              }}
              onOpenAutoFocus={(event) => {
                if (initialFocus) {
                  const target =
                    ref.current?.querySelector<HTMLElement>(initialFocus);
                  if (target) {
                    event.preventDefault();
                    target.focus();
                  }
                }
              }}
              aria-describedby={subtitle ? descriptionId : undefined}
            >
              <motion.div
                ref={ref}
                className={`modal ${wide ? "wide" : ""}`}
                initial={animated ? { opacity: 0, y: 24, scale: 0.97 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: animated ? 12 : 0,
                  scale: animated ? 0.98 : 1,
                }}
                transition={{
                  duration: animated ? 0.24 : 0,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="modal-inner">
                  <header>
                    <div>
                      <Dialog.Title asChild>
                        <h2>{t(title)}</h2>
                      </Dialog.Title>
                      {subtitle && (
                        <Dialog.Description id={descriptionId} asChild>
                          <p>{subtitle}</p>
                        </Dialog.Description>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      onClick={onClose}
                      aria-label={t("Close dialog")}
                    >
                      <X size={19} />
                    </button>
                  </header>
                  {children}
                </div>
              </motion.div>
            </Dialog.Content>
          </motion.div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: Error | string | null;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>
        {messageText(typeof error === "string" ? error : error.message)}
      </span>
      {retry && <Button onClick={retry}>{t("Retry")}</Button>}
    </div>
  ) : null;
}
export function Loading() {
  const { t } = useTranslation();
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>{t("Loading your workspace…")}</span>
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
  const { t } = useTranslation();
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{t(title)}</h3>
      <p>{t(description)}</p>
      {action}
    </div>
  );
}
export function Badge({ state }: { state: string }) {
  const { t } = useTranslation();
  return (
    <span className={`status ${state}`}>
      <span className="status-dot" />
      {t(state.charAt(0).toUpperCase() + state.slice(1))}
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
  const { t } = useTranslation();
  return (
    <progress
      className={`progress ${color}`}
      aria-label={t(label)}
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
  const { t: translate } = useTranslation();
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
          ? translate("Clipboard requires HTTPS or localhost")
          : copied
            ? translate("Copied")
            : translate(label)
      }
      aria-label={copied ? translate("Copied") : translate(label)}
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
      {showLabel && (
        <span>{copied ? translate("Copied") : translate(label)}</span>
      )}
    </button>
  );
}
export function bytes(value: number, decimals = 1) {
  const unit =
    value < 1024
      ? 0
      : Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = new Intl.NumberFormat(locale(), {
    maximumFractionDigits: unit ? decimals : 0,
  }).format(value / 1024 ** unit);
  return `${amount} ${i18n.t(["B", "KiB", "MiB", "GiB"][unit])}`;
}
export function ago(timestamp: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return i18n.t("just now");
  const unit = seconds < 3600 ? "minute" : seconds < 86400 ? "hour" : "day";
  const divisor = unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400;
  return new Intl.RelativeTimeFormat(locale(), { style: "short" }).format(
    -Math.floor(seconds / divisor),
    unit,
  );
}
export function date(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString(locale(), {
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
