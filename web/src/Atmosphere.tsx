import { type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePreferences } from "./Preferences";
import { sceneArt } from "./scene-art";

export function Atmosphere() {
  const { preferences, customImage, motion: enabled } = usePreferences();
  const { background, intensity } = preferences;
  const source =
    background === "none"
      ? null
      : background === "custom"
        ? customImage
        : sceneArt(background);
  return (
    <div
      className="atmosphere"
      aria-hidden="true"
      style={{ "--scene-strength": intensity / 100 } as CSSProperties}
    >
      <AnimatePresence initial={false}>
        {source && (
          <motion.div
            key={background}
            className={`scene scene-${background}`}
            initial={enabled ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: enabled ? 0.65 : 0 }}
          >
            <div
              className="scene-image scene-photo"
              style={{ backgroundImage: `url(${source})` }}
            />
            <div className="scene-shade" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
