export function TomatoIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="17" fill="#DF8067" />
      <polygon
        points="20,9 23.2,16.5 31,17 25,22.1 26.8,30 20,25.8 13.2,30 15,22.1 9,17 16.8,16.5"
        fill="#81984F"
      />
    </svg>
  );
}

export function TreeFruit() {
  return (
    <svg viewBox="0 0 70 66" fill="none" aria-hidden="true">
      <path
        d="M34 12C16 6 3 21 5 39C7 60 30 67 48 58C72 47 68 21 52 14C45 10 40 11 34 12Z"
        fill="#DF8067"
      />
      <path
        d="M32 15L28 5L38 11L43 2L44 12L54 13L45 18L43 25L36 19L27 23Z"
        fill="#A6BF70"
      />
    </svg>
  );
}
export const fruitPositions = [
  [65, 125],
  [182, 148],
  [151, 58],
  [104, 88],
  [157, 112],
  [74, 72],
  [124, 35],
  [200, 87],
  [96, 155],
  [153, 167],
  [47, 96],
  [179, 48],
];
const leafStyles = [
  [[66, 51, 17, 30, -42], [113, 36, 10, 27, 23], [111, 82, 5, 16, 9], [190, 71, 12, 27, 37], [188, 106, 7, 18, 65], [100, 155, 10, 21, 47]],
  [[73, 57, 20, 25, -58], [109, 32, 13, 24, -12], [106, 87, 7, 17, -26], [183, 61, 16, 28, 48], [198, 104, 9, 19, 78], [102, 148, 12, 19, 62]],
  [[62, 62, 13, 29, -65], [104, 39, 15, 29, 12], [121, 72, 7, 18, 28], [184, 77, 19, 26, 52], [194, 113, 8, 21, 72], [96, 153, 8, 24, 35]],
  [[77, 43, 19, 27, -24], [121, 39, 9, 30, 38], [106, 84, 8, 15, -15], [193, 67, 14, 31, 25], [180, 110, 10, 18, 52], [103, 159, 13, 19, 58]],
  [[64, 49, 21, 24, -53], [110, 28, 12, 21, 7], [110, 79, 6, 20, 18], [180, 66, 11, 32, 49], [201, 103, 10, 17, 80], [97, 145, 11, 25, 29]],
] as const;
const leafColors = ["#B2C979", "#B8CD7B", "#BDD185", "#B3CA78", "#BCD17D", "#B5CD7B"];

export default function TomatoTree({ count = 3, variant = 0, compact = false }: { count?: number; variant?: number; compact?: boolean }) {
  const leaves = leafStyles[variant] ?? leafStyles[0];
  return (
    <svg
      className="tomato-tree"
      viewBox={compact ? "30 0 200 210" : "0 0 260 210"}
      fill="none"
      role="img"
      aria-label={`结着 ${count} 颗番茄的果树`}
    >
      <ellipse cx="131" cy="198" rx="42" ry="5" fill="#C8D98B" />
      <path
        d="M118 192L120 127L92 84Q89 76 96 74Q102 70 106 77L135 113L158 87Q164 79 167 84Q170 87 164 95L142 127L142 192L146 197L115 197Z"
        fill="#59683D"
      />
      {leaves.map(([x, y, rx, ry, angle], index) => (
        <g key={index} data-orchard-part="leaf" data-pivot-x={x} data-pivot-y={y + ry * 0.6}>
          <ellipse
          cx={x}
          cy={y}
          rx={rx}
          ry={ry}
          transform={`rotate(${angle} ${x} ${y})`}
          fill={leafColors[index]}
          />
        </g>
      ))}
      {fruitPositions.slice(0, Math.min(count, 12)).map(([x, y], i) => (
        <g key={i} data-orchard-part="fruit" data-pivot-x={x} data-pivot-y={y - 20}>
          <g transform={`translate(${x - 25} ${y - 24})`}>
          <svg width="50" height="48">
            <TreeFruit />
          </svg>
          </g>
        </g>
      ))}
    </svg>
  );
}
