import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion } from "motion/react";
import { usePreferences } from "./Preferences";
import { locale } from "./i18n";

export { AnimatePresence } from "motion/react";

export function PageTransition({ children }: { children: ReactNode }) {
  const { motion: enabled } = usePreferences();
  return (
    <motion.div
      className="route-stage"
      initial={enabled ? { opacity: 0, y: 12, filter: "blur(3px)" } : false}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={
        enabled ? { opacity: 0, y: -6, filter: "blur(2px)" } : { opacity: 0 }
      }
      transition={{ duration: enabled ? 0.22 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Count({
  value,
  decimals = 0,
  pad = 0,
}: {
  value: number;
  decimals?: number;
  pad?: number;
}) {
  const { motion: enabled, preferences } = usePreferences();
  const previous = useRef(value);
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    if (!enabled) {
      previous.current = value;
      setDisplayed(value);
      return;
    }
    const animation = animate(previous.current, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (next) => {
        previous.current = next;
        setDisplayed(next);
      },
    });
    return () => animation.stop();
  }, [enabled, value]);
  const formatted = new Intl.NumberFormat(locale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(displayed);
  return (
    <span className="animated-number" lang={preferences.language}>
      {formatted.padStart(pad, "0")}
    </span>
  );
}
