import type { Metadata } from "next";
import "./gauri.css";

// Gauri.ai's own fonts (Fraunces serif for headings/logo, Plus Jakarta Sans
// for everything else) -- ported from askshree-app (v1)'s Google Fonts
// import. Loaded via a <link> scoped to this route segment (Next.js hoists
// it into <head> automatically) rather than touching v2's own Inter-only
// site-wide typography in src/app/layout.tsx.
export const metadata: Metadata = {
  title: "Gauri.ai",
  description: "Voice-first cattle health triage for farmers.",
};

export default function GauriLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gauri-scope">
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router route-segment layout, not pages/_document; this rule is a Pages-Router-only false positive here (matches root layout.tsx's Inter link). */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap"
      />
      {children}
    </div>
  );
}
