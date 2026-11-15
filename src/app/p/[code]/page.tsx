import type { Metadata, Viewport } from "next";
import PhoneHub from "@/components/presenter/PhoneHub";

export const metadata: Metadata = { title: "Join the session", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0a0a0a" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PhoneHub code={code.toUpperCase()} />;
}
