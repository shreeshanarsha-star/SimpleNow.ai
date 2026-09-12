import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
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
    <div className="gauri-scope flex flex-col min-h-screen">
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router route-segment layout, not pages/_document; this rule is a Pages-Router-only false positive here (matches root layout.tsx's Inter link). */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap"
      />
      <header className="relative z-50 bg-[#0b0f1a]/80 backdrop-blur-md border-b border-[rgba(232,163,61,0.18)] px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <Link href="/" title="SimpleNow Home" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <Logo height={21} />
        </Link>
        <span className="text-[11.5px] font-medium text-[rgba(237,232,220,0.7)] tracking-wide">
          Gauri.ai &bull; Part of SimpleNow.ai
        </span>
      </header>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
