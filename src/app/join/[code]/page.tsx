import type { Metadata, Viewport } from "next";
import JoinPhone from "@/components/studio/JoinPhone";

export const metadata: Metadata = { title: "Join the session", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0a0a0a" };

export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinPhone code={code.toUpperCase()} />;
}
