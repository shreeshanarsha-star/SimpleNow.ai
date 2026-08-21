// The real Askshree emblem -- a static asset (public/askshree-emblem.png),
// not a hand-drawn SVG approximation. Sized purely via width/height so
// every existing call site (Sidebar, login/signup, apply, assessment
// token page) keeps working unchanged with just a `size` prop. Accepts
// an optional extra `className` (e.g. a drop-shadow) that callers can
// layer on top of the base rounding.
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
      src="/askshree-emblem.png"
      width={size}
      height={size}
      alt="Askshree"
      className={`flex-shrink-0 rounded-[22%] ${className}`}
    />
  );
}
