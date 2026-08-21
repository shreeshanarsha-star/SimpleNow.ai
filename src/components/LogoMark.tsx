// Gold Sri Chakra (Sri Yantra) medallion -- the actual yantra structure,
// not just an abstract triangle badge: a square gated frame (bhupura), a
// ring of lotus petals, and the 9 interlocking triangles (4 upward
// "Shiva" + 5 downward "Shakti") around a central bindu. Simplified from
// a full traditional Sri Yantra (which has 8+16 petals and elaborate
// T-shaped gates) because this renders at ~26-30px everywhere it's used
// -- that detail would just be illegible pixel noise at this size. The
// 3D read is a radial gradient (bright highlight upper-left fading to a
// bronze shadow lower-right, single-light-source sphere shading) plus a
// drop-shadow, not an actual 3D render.
export default function LogoMark({ size = 26 }: { size?: number }) {
  const cx = 50;
  const cy = 50;
  const discR = 33;
  const triR = 29; // triangle radius, inside the disc

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

  const petalCount = 12;
  const petalInner = discR - 1;
  const petalOuter = discR + 9;
  const petalHalfWidth = 5.2;
  const petalMid = (petalInner + petalOuter) / 2;
  const petalPath = `M ${cx},${cy - petalInner} Q ${cx + petalHalfWidth},${cy - petalMid} ${cx},${cy - petalOuter} Q ${cx - petalHalfWidth},${cy - petalMid} ${cx},${cy - petalInner} Z`;

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
        <radialGradient id="lm-petal" cx="40%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="60%" stopColor="#d9ae3f" />
          <stop offset="100%" stopColor="#8a6b1e" />
        </radialGradient>
        <filter id="lm-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#3a2a08" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Bhupura -- the square gated frame */}
      <rect x="3" y="3" width="94" height="94" rx="10" fill="url(#lm-frame)" filter="url(#lm-shadow)" />
      <rect x="7" y="7" width="86" height="86" rx="8" fill="#fdf7e6" />
      <rect x="7" y="7" width="86" height="86" rx="8" fill="none" stroke="#5c4813" strokeOpacity="0.3" strokeWidth="1" />
      {/* Small gate notches, top/right/bottom/left -- a hint of the
          traditional T-gates without trying to render them at full detail */}
      {[0, 90, 180, 270].map((deg) => (
        <rect
          key={deg}
          x={cx - 5}
          y="3"
          width="10"
          height="6"
          fill="url(#lm-frame)"
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}

      {/* Lotus petal ring */}
      <g filter="url(#lm-shadow)">
        {Array.from({ length: petalCount }).map((_, i) => (
          <path
            key={i}
            d={petalPath}
            fill="url(#lm-petal)"
            stroke="#5c4813"
            strokeOpacity="0.4"
            strokeWidth="0.6"
            transform={`rotate(${(360 / petalCount) * i} ${cx} ${cy})`}
          />
        ))}
      </g>

      {/* Central disc + interlocking triangles + bindu */}
      <circle cx={cx} cy={cy} r={discR} fill="url(#lm-disc)" stroke="#5c4813" strokeOpacity="0.35" strokeWidth="1" />
      <g stroke="#5c4813" strokeWidth="1.4" strokeLinejoin="round" fill="none" opacity="0.85">
        {triangles.map((t, i) => {
          const ay = cy + t.apexY * triR;
          const by = cy + t.baseY * triR;
          const hw = t.hw * triR;
          return <polygon key={i} points={`${cx},${ay} ${cx - hw},${by} ${cx + hw},${by}`} />;
        })}
      </g>
      <circle cx={cx} cy={cy} r="2.8" fill="#5c4813" />
      <circle cx={cx - 0.9} cy={cy - 0.9} r="1.1" fill="#fff6d8" />
    </svg>
  );
}
