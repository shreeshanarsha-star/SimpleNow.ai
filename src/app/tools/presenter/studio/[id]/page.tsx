import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import StudioWizard from "@/components/studio/StudioWizard";

export const metadata: Metadata = { title: "Presenter Studio | SimpleNow.ai" };

export default async function StudioEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell title="Presenter Studio">
      <PersonalToolLayout title="Presenter Studio" description="Build your session step by step. Everything saves as you go." icon="mic" currentHref="/tools/presenter">
        <StudioWizard id={id} />
      </PersonalToolLayout>
    </AppShell>
  );
}
