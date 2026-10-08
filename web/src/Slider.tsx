import { useId, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  valueLabel = String(value),
  minLabel,
  maxLabel,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  valueLabel?: string;
  minLabel?: string;
  maxLabel?: string;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className="range-field"
      data-cursor-scope="range"
      data-dragging={dragging}
    >
      <div className="range-heading">
        <span id={id}>{label}</span>
        <span className="range-value" aria-hidden="true">
          {valueLabel}
        </span>
      </div>
      <SliderPrimitive.Root
        className="range-control"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onValueChange(next)}
        onPointerDownCapture={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <SliderPrimitive.Track className="range-track">
          <SliderPrimitive.Range className="range-fill" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="range-thumb"
          aria-labelledby={id}
          aria-valuetext={valueLabel}
        />
      </SliderPrimitive.Root>
      {(minLabel || maxLabel) && (
        <div className="range-limits" aria-hidden="true">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}
