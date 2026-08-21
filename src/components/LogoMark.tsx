// Compact rounded-square gold emblem with a simplified Sri Chakra
// (9 interlocking triangles + bindu) inside. Deliberately restrained per
// the brand brief: no lotus-petal ring, no gated frame, no glow, no
// large-scale ornamentation -- one quiet, precise insignia rather than a
// devotional illustration. The 3D read is a single soft radial highlight
// (upper-left) plus a faint drop-shadow, not heavy embossing.
export default function LogoMark({ size = 26 }: { size?: number }) {
  const cx = 50;
  const cy = 50;
  const discR = 30;
  const triR = 26;

  const triangles = [
    { apexY: -0.86, baseY: 0.84, hw: 0.92 },
    { apexY: -0.62, baseY: 0.7, hw: 0.72 },
    { apexY: -0.4, baseY: 0.53, hw: 0.53 },
    { apexY: -0.2, baseY: 0.32, hw: 0.32 },
    { apexY: 0.9, baseY: -0.85, hw: 0.95 },
    { apexY: 0.76, baseY: -0.66, hw: 0.78 },
    { apexY: 0.58, baseY: -0.48, hw: 0.6 },
    { apexY: 0.4, baseY: -0.28, hw: 0.42 },
    { apexY: 0.2, baseY: -0.1, hw: 0.2 },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="flex-shrink-0"
      aria-label="Askshree"
    >
      <defs>
        <linearGradient id="lm-square" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e9c877" />
          <stop offset="55%" stopColor="#a9821c" />
          <stop offset="100%" stopColor="#7a5e13" />
        </linearGradient>
        <filter id="lm-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.8" floodColor="#3a2a08" floodOpacity="0.28" />
        </filter>
      </defs>

      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#lm-square)" filter="url(#lm-shadow)" />
      <circle cx={cx} cy={cy} r={discR} fill="#fdf8ea" opacity="0.94" />
      <g stroke="#5c4813" strokeWidth="1.6" strokeLinejoin="round" fill="none" opacity="0.82">
        {triangles.map((t, i) => {
          const ay = cy + t.apexY * triR;
          const by = cy + t.baseY * triR;
          const hw = t.hw * triR;
          return <polygon key={i} points={`${cx},${ay} ${cx - hw},${by} ${cx + hw},${by}`} />;
        })}
      </g>
      <circle cx={cx} cy={cy} r="2.6" fill="#5c4813" />
    </svg>
  );
}
