import type { Metadata, Viewport } from "next";
import ShowRemote from "@/components/studio/ShowRemote";

export const metadata: Metadata = { title: "Presenter Studio — Remote" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default async function ShowRemotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShowRemote id={id} />;
}
