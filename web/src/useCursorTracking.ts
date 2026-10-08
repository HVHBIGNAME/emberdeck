import { useEffect } from "react";
import { cursorTarget, type CursorTarget } from "./cursor-geometry";

export function useCursorTracking(
  enabled: boolean,
  draw: (x: number, y: number, target: CursorTarget) => void,
  hide: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0,
      px = -1,
      py = -1,
      settleUntil = 0;
    let held: HTMLElement | null = null;
    let observed: HTMLElement | null = null;
    const resize = new ResizeObserver(() => schedule());
    const render = () => {
      frame = 0;
      if (px < 0 || document.hidden) return;
      const target = held?.isConnected
        ? { element: held, native: false }
        : cursorTarget(document.elementFromPoint(px, py));
      if (target.element !== observed) {
        resize.disconnect();
        observed = target.element;
        if (observed) resize.observe(observed);
      }
      draw(px, py, target);
      if (performance.now() < settleUntil || held)
        frame = requestAnimationFrame(render);
    };
    function schedule() {
      settleUntil = performance.now() + 450;
      if (!frame && px >= 0 && !document.hidden)
        frame = requestAnimationFrame(render);
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      px = event.clientX;
      py = event.clientY;
      schedule();
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      move(event);
      held =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-cursor-scope="range"]')
          : null;
    };
    const release = () => {
      held = null;
      schedule();
    };
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      px = py = -1;
      held = observed = null;
      resize.disconnect();
      hide();
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", clear);
    window.addEventListener("keydown", clear);
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    document.documentElement.addEventListener("pointerleave", clear);
    return () => {
      clear();
      changes.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("keydown", clear);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      document.documentElement.removeEventListener("pointerleave", clear);
    };
  }, [enabled, draw, hide]);
}
