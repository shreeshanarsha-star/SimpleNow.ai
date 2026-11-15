import type { Metadata, Viewport } from "next";
import ControlPad from "@/components/presenter/ControlPad";

export const metadata: Metadata = { title: "Presenter.ai — Control" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default async function ControlPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  return <ControlPad sessionId={s} />;
}
