// 3D-look gold magnifying glass for the Overview empty state -- same
// technique as LogoMark (radial gradients for a single-light-source
// sphere/cylinder read + a drop-shadow for lift), not a real 3D render.
// Rendered at a larger size (~72px) than LogoMark, so it can carry a bit
// more gradient detail (a highlighted glass ring + a rounded handle)
// without looking muddy.
export default function GoldSearchGlyph({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="gsg-ring" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="45%" stopColor="#e7c15c" />
          <stop offset="80%" stopColor="#b8860b" />
          <stop offset="100%" stopColor="#6e5309" />
        </radialGradient>
        <linearGradient id="gsg-handle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d98a" />
          <stop offset="50%" stopColor="#b8860b" />
          <stop offset="100%" stopColor="#5c4813" />
        </linearGradient>
        <radialGradient id="gsg-glass" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fffdf3" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#fdf6e3" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#e7c15c" stopOpacity="0.12" />
        </radialGradient>
        <filter id="gsg-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#3a2a08" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#gsg-shadow)">
        <rect
          x="60"
          y="60"
          width="13"
          height="34"
          rx="6"
          fill="url(#gsg-handle)"
          transform="rotate(45 66.5 77)"
        />
        <circle cx="42" cy="42" r="29" fill="url(#gsg-glass)" />
        <circle cx="42" cy="42" r="29" fill="none" stroke="url(#gsg-ring)" strokeWidth="7" />
      </g>
    </svg>
  );
}
