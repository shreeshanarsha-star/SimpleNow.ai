// Understated interaction icon for the Overview empty state -- a clean
// outline magnifying glass with a small accent dot, not an illustration.
// Both colors resolve through the active theme's --badge-icon/--badge-dot
// custom properties, so the glyph re-tints automatically with the rest
// of the chrome when the theme switches.
export default function GoldSearchGlyph({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" fill="none">
      <circle cx="21" cy="21" r="13" style={{ stroke: "var(--badge-icon)" }} strokeWidth="2.4" />
      <line
        x1="30.5"
        y1="30.5"
        x2="41"
        y2="41"
        style={{ stroke: "var(--badge-icon)" }}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="21" cy="21" r="3" style={{ fill: "var(--badge-dot)" }} />
    </svg>
  );
}
