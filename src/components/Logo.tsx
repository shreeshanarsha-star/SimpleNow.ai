// The full SimpleNow wordmark -- the actual approved logo (chrome "Simple" +
// gold "Now" with the checkmark integrated into the "o", full 3D bevel and
// reflection), trimmed straight to its own bounding box (public/simplenow-logo.png).
// Unlike LogoMark (a flat icon-sized crop used where the mark renders too
// small for the full wordmark's detail to read), this is what every spot
// that used to pair LogoMark with a hand-typed "SimpleNow" text label now
// renders instead -- one image carries the brand name, so no adjacent text
// node duplicates it. Sized by `height` (matching the row it sits in) with
// width following the logo's fixed ~2.95:1 aspect ratio automatically, so
// callers never have to hand-pick a width that could squash or stretch it.
export default function Logo({
  height = 28,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative brand wordmark rendered at many small, varying sizes across header/auth chrome; next/image's fixed-dimension optimization pipeline doesn't fit that use.
    <img
      src="/simplenow-logo.png"
      height={height}
      alt="SimpleNow"
      className={`flex-shrink-0 w-auto ${className}`}
      style={{ height }}
    />
  );
}
