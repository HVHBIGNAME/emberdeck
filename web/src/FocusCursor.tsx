import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useMedia, usePreferences } from "./Preferences";

export function FocusCursor() {
  const { preferences, motion: animated, reducedMotion } = usePreferences();
  const finePointer = useMedia("(pointer: fine) and (hover: hover)");
  const enabled = preferences.cursor && finePointer && !reducedMotion;
  const x = useMotionValue(-1000),
    y = useMotionValue(-1000);
  const width = useMotionValue(22),
    height = useMotionValue(22),
    radius = useMotionValue(12);
  const dotX = useMotionValue(-1000),
    dotY = useMotionValue(-1000),
    opacity = useMotionValue(0);
  const spring = { stiffness: 480, damping: 38, mass: 0.55 };
  const sx = useSpring(x, spring),
    sy = useSpring(y, spring);
  const sw = useSpring(width, spring),
    sh = useSpring(height, spring),
    sr = useSpring(radius, spring);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let px = -1000,
      py = -1000;
    const root = document.documentElement;
    const render = () => {
      frame = 0;
      const hit = document.elementFromPoint(px, py);
      const target = hit?.closest<HTMLElement>(
        'button, a[href], summary, [role="option"], [role="combobox"], [role="switch"], input, textarea, label:has(> input[type="radio"]), label:has(> input[type="checkbox"])',
      );
      const native =
        target?.matches(
          'input:not([type="checkbox"]):not([type="radio"]), textarea, :disabled',
        ) || target?.getAttribute("aria-disabled") === "true";
      root.dataset.cursor = native ? "native" : "custom";
      opacity.set(native ? 0 : 1);
      dotX.set(px - 2);
      dotY.set(py - 2);
      if (target && !native) {
        const rect = target.getBoundingClientRect();
        x.set(rect.left - 4);
        y.set(rect.top - 4);
        width.set(rect.width + 8);
        height.set(rect.height + 8);
        radius.set(
          Math.max(
            8,
            parseFloat(getComputedStyle(target).borderTopLeftRadius) + 4,
          ),
        );
      } else {
        x.set(px - 11);
        y.set(py - 11);
        width.set(22);
        height.set(22);
        radius.set(12);
      }
    };
    const schedule = () => {
      if (!frame && px >= 0) frame = requestAnimationFrame(render);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      px = event.clientX;
      py = event.clientY;
      schedule();
    };
    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      px = -1000;
      py = -1000;
      opacity.set(0);
      delete root.dataset.cursor;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", schedule, { passive: true });
    window.addEventListener("keydown", hide);
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("blur", hide);
    document.documentElement.addEventListener("pointerleave", hide);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", schedule);
      window.removeEventListener("keydown", hide);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("blur", hide);
      document.documentElement.removeEventListener("pointerleave", hide);
      hide();
    };
  }, [enabled, x, y, width, height, radius, dotX, dotY, opacity]);

  if (!enabled) return null;
  return createPortal(
    <div className="focus-cursor" aria-hidden="true">
      <motion.div
        className="cursor-outline"
        style={{
          x: animated ? sx : x,
          y: animated ? sy : y,
          width: animated ? sw : width,
          height: animated ? sh : height,
          borderRadius: animated ? sr : radius,
          opacity,
        }}
      />
      <motion.div
        className="cursor-dot"
        style={{ x: dotX, y: dotY, opacity }}
      />
    </div>,
    document.body,
  );
}
