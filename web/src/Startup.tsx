import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import App from "./app";
import { usePreferences } from "./Preferences";
import { useTranslation } from "./i18n";
import { Logo } from "./ui";
import "./startup.css";

const minimumDuration = 900;

export function Startup() {
  const { preferences, motion: animated } = usePreferences();
  const { t } = useTranslation();
  const [startedAt] = useState(() => performance.now());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [blocking, setBlocking] = useState(true);
  const hold = preferences.loadingIntro && animated && !failed;
  const onReady = useCallback((error = false) => {
    setReady(true);
    setFailed(error);
  }, []);

  useEffect(() => {
    if (complete || !hold) return;
    const timer = window.setTimeout(
      () => setElapsed(true),
      Math.max(0, minimumDuration - (performance.now() - startedAt)),
    );
    return () => window.clearTimeout(timer);
  }, [complete, hold, startedAt]);

  useEffect(() => {
    if (ready && (!hold || elapsed)) setComplete(true);
  }, [ready, hold, elapsed]);

  return (
    <>
      <div
        className="startup-content"
        inert={blocking}
        aria-hidden={blocking || undefined}
      >
        <App onReady={onReady} />
      </div>
      <AnimatePresence onExitComplete={() => setBlocking(false)}>
        {!complete && (
          <motion.div
            key="startup"
            className="startup-screen"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: animated && !failed ? 0.22 : 0 }}
          >
            <motion.div
              className="startup-brand"
              initial={animated ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: animated ? 0.5 : 0,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Logo />
              <div className="startup-track" aria-hidden="true">
                <span />
              </div>
              <output>{t("Loading your workspace…")}</output>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
