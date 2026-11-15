import type { Metadata } from "next";
import LiveStage from "@/components/presenter/LiveStage";

export const metadata: Metadata = { title: "Presenter.ai — TV" };

export default async function LivePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  return <LiveStage sessionId={s} />;
}
