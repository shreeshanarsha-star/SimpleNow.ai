// Gold Sri Yantra medallion -- replaces the plain brand-blue square used
// everywhere as a placeholder logo. Same 9-triangle (4 upward "Shiva" + 5
// downward "Shakti") + bindu geometry used for the arc-reactor core in the
// v1 build, redrawn here as a flat embossed medallion: a radial gradient
// (light highlight upper-left, deep bronze shadow lower-right) fakes a
// domed 24kt-gold surface without needing an actual 3D renderer for what
// is, everywhere it's used, a ~26-40px icon.
export default function LogoMark({ size = 26 }: { size?: number }) {
  const R = 42; // triangle radius in the 100x100 viewBox, before the bindu
  const cx = 50;
  const cy = 50;

  // Same normalized {apexY, baseY, hw} triangle set as OrbitalStageArc's
  // Sri Chakra (4 upward Shiva + 5 downward Shakti), scaled to this viewBox.
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
        <linearGradient id="lm-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d98a" />
          <stop offset="50%" stopColor="#b8860b" />
          <stop offset="100%" stopColor="#5c4813" />
        </linearGradient>
        <radialGradient id="lm-disc" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="35%" stopColor="#f0d585" />
          <stop offset="70%" stopColor="#c99a2e" />
          <stop offset="100%" stopColor="#7a5a15" />
        </radialGradient>
        <filter id="lm-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#3a2a08" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect x="3" y="3" width="94" height="94" rx="22" fill="url(#lm-frame)" filter="url(#lm-shadow)" />
      <rect x="7" y="7" width="86" height="86" rx="18" fill="url(#lm-disc)" />
      <rect
        x="7"
        y="7"
        width="86"
        height="86"
        rx="18"
        fill="none"
        stroke="#5c4813"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      <g stroke="#5c4813" strokeWidth="1.6" strokeLinejoin="round" fill="none" opacity="0.85">
        {triangles.map((t, i) => {
          const ay = cy + t.apexY * R;
          const by = cy + t.baseY * R;
          const hw = t.hw * R;
          return <polygon key={i} points={`${cx},${ay} ${cx - hw},${by} ${cx + hw},${by}`} />;
        })}
      </g>
      <circle cx={cx} cy={cy} r="3.2" fill="#5c4813" />
      <circle cx={cx - 1} cy={cy - 1} r="1.3" fill="#fff6d8" />
    </svg>
  );
}
