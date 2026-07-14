"use client";

import { getDisciplineDefinition, type DisciplineTheme } from "@/lib/discipline";

type RadarAxis = {
  key: string;
  label: string;
  shortLabel: string;
  accuracy: number | null;
};

export function SportRadarGraphic({
  axes,
  glowId,
  overlayText,
  theme = getDisciplineDefinition("football_11").theme,
}: {
  axes: RadarAxis[];
  glowId: string;
  overlayText?: string | null;
  theme?: DisciplineTheme;
}) {
  const points = radarPoints(axes.map((axis) => axis.accuracy ?? 0), 88, 110);
  const guideRings = [25, 50, 75, 100].map((value) =>
    radarPoints(Array.from({ length: axes.length }, () => value), 88, 110)
  );

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[28px] bg-[#050b12] p-3 sm:max-w-[380px] sm:p-5"
      style={{
        border: `1px solid ${theme.border}`,
        boxShadow: `inset 0 0 50px ${theme.accentSoft}`,
      }}
    >
      <svg viewBox="0 0 220 220" className="h-full w-full">
        <defs>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {guideRings.map((ring, index) => (
          <polygon
            key={`ring-${index}`}
            points={ring}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
        ))}
        {axes.map((axis, index) => {
          const end = radarAxisPoint(index, axes.length, 88, 110);
          const label = radarAxisPoint(index, axes.length, 100, 110);
          return (
            <g key={axis.key}>
              <line
                x1="110"
                y1="110"
                x2={end.x}
                y2={end.y}
                stroke="rgba(255,255,255,0.12)"
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-[7px] font-black uppercase sm:text-[8px]"
              >
                {axis.shortLabel}
              </text>
            </g>
          );
        })}
        <polygon
          points={points}
          fill={theme.accentSoft}
          stroke={theme.accent}
          strokeWidth="3"
          filter={`url(#${glowId})`}
        />
        {points.split(" ").map((point, index) => {
          const [x, y] = point.split(",").map(Number);
          return <circle key={`${point}-${index}`} cx={x} cy={y} r="4" fill={theme.accent} />;
        })}
        <circle cx="110" cy="110" r="4" fill={theme.accent} />
      </svg>

      {overlayText ? (
        <div
          className="absolute inset-x-5 bottom-5 rounded-2xl border border-dashed bg-[#050b12]/90 p-3 text-center text-xs font-bold text-zinc-300"
          style={{ borderColor: theme.border }}
        >
          {overlayText}
        </div>
      ) : null}
    </div>
  );
}

function radarPoints(values: number[], radius: number, center: number) {
  return values
    .map((value, index) => {
      const point = radarAxisPoint(
        index,
        values.length,
        radius * (Math.max(0, Math.min(value, 100)) / 100),
        center
      );
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function radarAxisPoint(
  index: number,
  totalAxes: number,
  radius: number,
  center: number
) {
  const angle = (-90 + index * (360 / Math.max(totalAxes, 1))) * (Math.PI / 180);
  return {
    x: Math.round((center + Math.cos(angle) * radius) * 10) / 10,
    y: Math.round((center + Math.sin(angle) * radius) * 10) / 10,
  };
}
