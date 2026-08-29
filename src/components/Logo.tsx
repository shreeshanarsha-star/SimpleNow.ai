// The SimpleNow wordmark -- rendered as real text + one inline SVG glyph
// instead of a raster image. The old PNG-based version (a single detailed
// image with 3D bevel/reflection) looked crisp at its native ~1272x260 but
// fell apart once scaled down to the 26-32px it actually renders at in the
// UI -- the checkmark and underline blurred into mush. Text scales
// perfectly at any size with zero extra assets, so this is a permanent fix,
// not a bigger image.
//
// "Simple" is bound to the app's theme-adaptive `--ink` token, so it stays
// legible if a user switches to the dark UI theme (where ink flips to
// near-white). "Now" + the checkmark + the underline stay a fixed brand
// gold (#C79A3E) independent of the per-theme accent color (`--brand-rgb`
// swaps between gold/blue/dark-purple/teal across the app's 4 themes) --
// the logo's color is a brand identity, not a UI accent that should drift
// with whatever theme a signed-in user happens to prefer.
//
// Sized by `height`, which doubles as the font-size (the wordmark's own
// line-height is 1), so callers never hand-pick a width -- same drop-in
// prop interface (`height`, `className`) as the old image-based component.
const GOLD = "#C79A3E";

export default function Logo({
  height = 28,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const checkSize = height * 0.58;

  return (
    <span
      className={`inline-flex items-baseline flex-shrink-0 whitespace-nowrap select-none ${className}`}
      style={{
        fontFamily: "'InterDisplay', 'Inter', sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      <span style={{ color: "var(--ink)" }}>Simple</span>
      <span className="relative inline-flex items-baseline" style={{ color: GOLD }}>
        N
        <svg
          width={checkSize}
          height={checkSize}
          viewBox="0 0 100 100"
          aria-hidden="true"
          style={{ transform: "translateY(0.08em)" }}
        >
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="12" />
          <path
            d="M27 51 L43 67 L75 33"
            fill="none"
            stroke="currentColor"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        w
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: "0.03em",
            right: "0.03em",
            bottom: "-0.15em",
            height: "0.065em",
            background: GOLD,
          }}
        />
      </span>
    </span>
  );
}
