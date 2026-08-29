// The SimpleNow mark -- a static asset (public/simplenow-mark.png) cropped
// directly from the approved SimpleNow logo's checkmark motif (the check
// inside the "o" of "Now"), not a hand-drawn SVG approximation. That flat
// crop was used deliberately: the full 3D chrome/gold wordmark reads fine
// at hero size but the bevel and reflection collapse into a grey smear at
// the ~26-32px this mark actually renders at, so a simple shape carries the
// brand at icon size instead. Sized purely via width/height so every
// existing call site (Sidebar, login/signup, apply, assessment token page)
// keeps working unchanged with just a `size` prop. Accepts an optional
// extra `className` (e.g. a drop-shadow) that callers can layer on top of
// the base rounding.
export default function LogoMark({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny (26-32px) decorative brand mark rendered many times per page; next/image's optimization pipeline is unnecessary overhead for an asset this small.
    <img
      src="/simplenow-mark.png"
      width={size}
      height={size}
      alt="SimpleNow"
      className={`flex-shrink-0 rounded-[22%] ${className}`}
    />
  );
}
