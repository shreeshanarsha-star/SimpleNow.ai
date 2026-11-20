import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import StudioHome from "@/components/studio/StudioHome";

export const metadata: Metadata = { title: "Presenter Studio | SimpleNow.ai" };

export default function StudioPage() {
  return (
    <AppShell title="Presenter Studio">
      <PersonalToolLayout title="Presenter Studio" description="Turn any deck into a live, interactive session with your AI co-presenter." icon="mic" currentHref="/tools/presenter">
        <StudioHome />
      </PersonalToolLayout>
    </AppShell>
  );
}
