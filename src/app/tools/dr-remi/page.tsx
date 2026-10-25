import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import RemiConsole from "@/components/tools/remi/RemiConsole";

export const metadata: Metadata = {
  title: "Dr.Remi.ai — 24/7 multilingual AI sales assistant | SimpleNow.ai",
  description: "Voice sales assistant that answers customers in any language from your approved product knowledge, qualifies leads and alerts your team.",
};

// Personal Tool (bundled): any signed-in user can create their own isolated
// Dr.Remi workspace; access inside it is governed by remi_members roles.
// /tools/* is login-protected by middleware.
export default function DrRemiPage() {
  return (
    <AppShell title="Dr.Remi.ai">
      <PersonalToolLayout
        title="Dr.Remi.ai"
        description="24/7 AI sales assistant — speaks every customer's language, answers from your Brains, captures and qualifies leads."
        icon="stethoscope"
        currentHref="/tools/dr-remi"
      >
        <Suspense fallback={<div className="text-sm text-ink-muted p-6">Loading…</div>}>
          <RemiConsole />
        </Suspense>
      </PersonalToolLayout>
    </AppShell>
  );
}
