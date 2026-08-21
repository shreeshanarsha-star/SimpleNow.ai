// Understated interaction icon for the Overview empty state -- a clean
// charcoal outline magnifying glass with a small gold accent dot, not an
// illustration. Replaces the earlier gradient-filled "3D" glyph, which
// read as decorative rather than functional. Kept as its own component
// (name unchanged) since it's still the one dedicated empty-state icon.
export default function GoldSearchGlyph({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" fill="none">
      <circle cx="21" cy="21" r="13" stroke="#3a352c" strokeWidth="2.4" />
      <line x1="30.5" y1="30.5" x2="41" y2="41" stroke="#3a352c" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="21" cy="21" r="3" fill="#a9821c" />
    </svg>
  );
}
