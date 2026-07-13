"use client";

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
}: {
  axes: RadarAxis[];
  glowId: string;
  overlayText?: string | null;
}) {
  const points = radarPoints(axes.map((axis) => axis.accuracy ?? 0), 88, 110);
  const guideRings = [25, 50, 75, 100].map((value) =>
    radarPoints(Array.from({ length: axes.length }, () => value), 88, 110)
  );

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[28px] border border-[#6fc11f]/20 bg-[#050b12] p-3 shadow-[inset_0_0_50px_rgba(111,193,31,0.08)] sm:max-w-[380px] sm:p-5">
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
          fill="rgba(111,193,31,0.32)"
          stroke="#6fc11f"
          strokeWidth="3"
          filter={`url(#${glowId})`}
        />
        {points.split(" ").map((point, index) => {
          const [x, y] = point.split(",").map(Number);
          return <circle key={`${point}-${index}`} cx={x} cy={y} r="4" fill="#b7ff8a" />;
        })}
        <circle cx="110" cy="110" r="4" fill="#6fc11f" />
      </svg>

      {overlayText ? (
        <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-dashed border-[#6fc11f]/25 bg-[#050b12]/90 p-3 text-center text-xs font-bold text-zinc-300">
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
