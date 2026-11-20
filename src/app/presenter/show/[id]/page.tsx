import type { Metadata } from "next";
import ShowTV from "@/components/studio/ShowTV";

export const metadata: Metadata = { title: "Presenter Studio — TV" };

export default async function ShowTVPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShowTV id={id} />;
}
