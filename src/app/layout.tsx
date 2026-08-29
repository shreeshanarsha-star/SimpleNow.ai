import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SimpleNow — Simpler ways. Smarter work.",
  description: "AI-assisted tools for every department at SimpleNow.ai",
};

// Runs before first paint so a saved theme (localStorage) applies
// immediately -- without this, the page would flash the default "gold"
// theme for a frame before JS hydrates and switches it.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('askshree-theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="gold">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout, not pages/_document; this rule is a Pages-Router-only false positive here. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
