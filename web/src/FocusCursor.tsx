import { useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useMedia, usePreferences } from "./Preferences";
import { cursorGeometry, type CursorTarget } from "./cursor-geometry";
import { useCursorTracking } from "./useCursorTracking";

function useChannel(initial: number) {
  const raw = useMotionValue(initial);
  const smooth = useSpring(raw, { stiffness: 620, damping: 46, mass: 0.75 });
  return useMemo(() => ({ raw, smooth }), [raw, smooth]);
}

export function FocusCursor() {
  const { preferences, motion: animated, reducedMotion } = usePreferences();
  const finePointer = useMedia("(pointer: fine) and (hover: hover)");
  const enabled = preferences.cursor && finePointer && !reducedMotion;
  const x = useChannel(-1000),
    y = useChannel(-1000),
    width = useChannel(16),
    height = useChannel(16);
  const tlx = useChannel(8),
    trx = useChannel(8),
    brx = useChannel(8),
    blx = useChannel(8);
  const tly = useChannel(8),
    try_ = useChannel(8),
    bry = useChannel(8),
    bly = useChannel(8);
  const corners = useMemo(
    () => [tlx, trx, brx, blx, tly, try_, bry, bly],
    [tlx, trx, brx, blx, tly, try_, bry, bly],
  );
  const borderRadius = useTransform(
    corners.map((corner) => (animated ? corner.smooth : corner.raw)),
    (values) =>
      `${values
        .slice(0, 4)
        .map((v) => `${v}px`)
        .join(" ")} / ${values
        .slice(4)
        .map((v) => `${v}px`)
        .join(" ")}`,
  );
  const dotX = useMotionValue(-1000),
    dotY = useMotionValue(-1000);
  const opacity = useMotionValue(0),
    dotOpacity = useMotionValue(0);
  const primed = useRef(false);
  const hide = useCallback(() => {
    opacity.set(0);
    dotOpacity.set(0);
    primed.current = false;
    delete document.documentElement.dataset.cursor;
  }, [opacity, dotOpacity]);
  const draw = useCallback(
    (px: number, py: number, target: CursorTarget) => {
      document.documentElement.dataset.cursor = target.native
        ? "native"
        : "custom";
      dotX.set(px - 2);
      dotY.set(py - 2);
      dotOpacity.set(target.native ? 0 : 1);
      opacity.set(target.native ? 0 : target.element ? 1 : 0.35);
      const box = target.element
        ? cursorGeometry(target.element)
        : {
            x: px - 8,
            y: py - 8,
            width: 16,
            height: 16,
            radii: [8, 8, 8, 8, 8, 8, 8, 8],
          };
      x.raw.set(box.x);
      y.raw.set(box.y);
      width.raw.set(box.width);
      height.raw.set(box.height);
      corners.forEach((corner, i) => corner.raw.set(box.radii[i]));
      if (!primed.current) {
        x.smooth.jump(box.x);
        y.smooth.jump(box.y);
        width.smooth.jump(box.width);
        height.smooth.jump(box.height);
        corners.forEach((corner, i) => corner.smooth.jump(box.radii[i]));
      }
      primed.current = !target.native;
    },
    [x, y, width, height, corners, dotX, dotY, dotOpacity, opacity],
  );
  useCursorTracking(enabled, draw, hide);
  if (!enabled) return null;
  return createPortal(
    <div className="focus-cursor" aria-hidden="true">
      <motion.div
        className="cursor-outline"
        style={{
          x: animated ? x.smooth : x.raw,
          y: animated ? y.smooth : y.raw,
          width: animated ? width.smooth : width.raw,
          height: animated ? height.smooth : height.raw,
          borderRadius,
          opacity,
        }}
      />
      <motion.div
        className="cursor-dot"
        style={{ x: dotX, y: dotY, opacity: dotOpacity }}
      />
    </div>,
    document.body,
  );
}
