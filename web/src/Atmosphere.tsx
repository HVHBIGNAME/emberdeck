import { type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePreferences } from "./Preferences";

const stars = Array.from({ length: 16 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  top: `${(index * 19 + 7) % 90}%`,
  delay: `${index * -1.3}s`,
}));

export function Atmosphere() {
  const { preferences, customImage, motion: enabled } = usePreferences();
  const { background, intensity } = preferences;
  return (
    <div
      className="atmosphere"
      aria-hidden="true"
      style={{ "--scene-strength": intensity / 100 } as CSSProperties}
    >
      <AnimatePresence initial={false}>
        {background !== "none" && (
          <motion.div
            key={background}
            className={`scene scene-${background}`}
            initial={enabled ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: enabled ? 0.6 : 0 }}
          >
            {background === "custom" ? (
              customImage && (
                <div
                  className="scene-image"
                  style={{ backgroundImage: `url(${customImage})` }}
                />
              )
            ) : (
              <>
                <div className="scene-glow glow-one" />
                <div className="scene-glow glow-two" />
                <div className="scene-glow glow-three" />
                <div className="scene-grid" />
                {background !== "aurora" && <Landscape kind={background} />}
                <div className="scene-particles">
                  {stars.map((star, index) => (
                    <i
                      key={index}
                      style={{
                        left: star.left,
                        top: star.top,
                        animationDelay: star.delay,
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Landscape({ kind }: { kind: string }) {
  return (
    <svg
      className="landscape"
      viewBox="0 0 1600 520"
      preserveAspectRatio="xMidYMax slice"
    >
      {kind === "end" ? (
        <g className="floating-islands">
          <path d="M110 230h85v-25h120v25h75v35h-40v45h-35v50h-45v45h-60v-45h-45v-50h-35v-45h-20z" />
          <path d="M1120 110h70V85h115v25h85v35h-25v45h-40v45h-50v65h-60v-40h-45v-60h-35v-45h-15z" />
          <path d="M730 390h45v-20h75v20h45v25h-25v35h-35v35h-40v-35h-30v-35h-35z" />
        </g>
      ) : (
        <>
          <path
            className="landscape-far"
            d="M0 380h90v-40h95v-70h70v-55h115v-55h110v65h75v-40h80v95h100v-65h90v-45h120v-45h90v70h75v-45h70v80h80v65h85v-40h100v65h100v-30h100v260H0z"
          />
          <path
            className="landscape-near"
            d="M0 440h150v-35h105v-45h170v30h140v-50h140v55h90v-15h150v-40h110v45h135v-25h110v70h150v-15h150v25h100v90H0z"
          />
          {kind === "overworld" && (
            <g className="pixel-clouds">
              <path d="M150 135h40v-20h70v20h50v20H150z" />
              <path d="M710 80h50V60h85v20h40v25H710z" />
              <path d="M1270 165h30v-20h90v20h40v20h-160z" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}
