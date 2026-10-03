import type { Metadata } from "next";

// NR Synergy Admin Console root. Deliberately bare: the sign-in screen
// (./login) and the guarded console shell ((console)/layout.tsx) each own
// their chrome. Nothing here is shared with the employee app's AppShell.
export const metadata: Metadata = {
  title: "NR Synergy · Admin Console",
  robots: { index: false, follow: false },
};

export default function NrSynergyAdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-page text-ink">{children}</div>;
}
