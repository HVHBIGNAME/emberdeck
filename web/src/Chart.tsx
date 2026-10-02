import { useId, useState } from "react";

export function Sparkline({
  values,
  color = "var(--orange)",
}: {
  values: number[];
  color?: string;
}) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map(
      (v, i) =>
        `${(i / Math.max(values.length - 1, 1)) * 110},${35 - ((v - min) / Math.max(max - min, 1)) * 29}`,
    )
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 110 40" aria-hidden="true">
      <polyline
        points={points}
        stroke={color}
        fill="none"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Chart({
  points,
  color = "#efa16f",
  unit = "players",
  height = 170,
}: {
  points: { at: number; value: number }[];
  color?: string;
  unit?: string;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length)
    return (
      <div className="chart-empty" style={{ height }}>
        Metrics appear after the first node observation.
      </div>
    );
  const max = Math.max(
    4,
    Math.ceil(Math.max(...points.map((p) => p.value)) / 4) * 4,
  );
  const width = 740;
  const top = 12;
  const bottom = height - 25;
  const left = 30;
  const right = width - 14;
  const x = (i: number) =>
    left + (i / Math.max(points.length - 1, 1)) * (right - left);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  const line = points
    .map(
      (p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${right},${bottom} L${left},${bottom} Z`;
  const selected = Math.min(hover ?? points.length - 1, points.length - 1);
  const selectedTime = new Date(points[selected].at * 1000).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".17" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1={left}
              y1={y((max * i) / 4)}
              x2={right}
              y2={y((max * i) / 4)}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <text x={left - 10} y={y((max * i) / 4) + 3} textAnchor="end">
              {Math.round((max * i) / 4)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover !== null && (
          <line
            x1={x(selected)}
            y1={top}
            x2={x(selected)}
            y2={bottom}
            stroke={color}
            strokeOpacity=".35"
            strokeDasharray="4 4"
          />
        )}
        <circle
          cx={x(selected)}
          cy={y(points[selected].value)}
          r="5.5"
          fill={color}
          fillOpacity=".15"
        />
        <circle
          cx={x(selected)}
          cy={y(points[selected].value)}
          r="2.8"
          fill={color}
        />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const index = Math.round((i / 5) * (points.length - 1));
          return (
            <text
              key={i}
              x={x(index)}
              y={height - 3}
              textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"}
            >
              {i === 5
                ? "Now"
                : new Date(points[index].at * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
            </text>
          );
        })}
      </svg>
      <input
        className="chart-scrub"
        type="range"
        min={0}
        max={points.length - 1}
        value={selected}
        aria-label={`${unit} history`}
        aria-valuetext={`${points[selected].value.toFixed(0)} ${unit} at ${selectedTime}`}
        onChange={(event) => setHover(Number(event.target.value))}
        onFocus={() => setHover(selected)}
        onBlur={() => setHover(null)}
        onMouseLeave={(event) => {
          if (document.activeElement !== event.currentTarget) setHover(null);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const local = ((event.clientX - rect.left) / rect.width) * width;
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(
                  ((local - left) / (right - left)) * (points.length - 1),
                ),
              ),
            ),
          );
        }}
      />
      {hover !== null && (
        <div className="chart-tooltip">
          {points[selected].value.toFixed(0)} {unit}{" "}
          <span>at {selectedTime}</span>
        </div>
      )}
    </div>
  );
}
