import { useId } from "react";
import { motion } from "motion/react";
import { usePreferences } from "./Preferences";

export function SegmentedControl({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  const { motion: animated } = usePreferences();
  return (
    <fieldset className="segment" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {value === option.value && (
            <motion.span
              className="segment-active"
              layoutId={animated ? `segment-${id}` : undefined}
              transition={{
                type: "spring",
                stiffness: 480,
                damping: 38,
                duration: animated ? undefined : 0,
              }}
            />
          )}
          <span className="segment-label">{option.label}</span>
        </button>
      ))}
    </fieldset>
  );
}
