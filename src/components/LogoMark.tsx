// The real Askshree emblem -- a static asset (public/askshree-emblem.png),
// not a hand-drawn SVG approximation. Swapped in after the user supplied
// the actual finished logo. Sized purely via width/height so every
// existing call site (Sidebar, login/signup, apply, assessment token
// page) keeps working unchanged with just a `size` prop.
export default function LogoMark({ size = 26 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny (26-32px) decorative brand mark rendered many times per page; next/image's optimization pipeline is unnecessary overhead for an asset this small.
    <img
      src="/askshree-emblem.png"
      width={size}
      height={size}
      alt="Askshree"
      className="flex-shrink-0 rounded-[22%]"
    />
  );
}
