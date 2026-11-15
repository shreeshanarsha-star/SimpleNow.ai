import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import PresenterConsole from "@/components/presenter/PresenterConsole";

export const metadata: Metadata = {
  title: "Presenter.ai — your AI digital twin co-host | SimpleNow.ai",
};

// Owner-only (the API routes enforce it); /tools/* is login-protected by middleware.
export default function PresenterPage() {
  return (
    <AppShell title="Presenter.ai">
      <PersonalToolLayout
        title="Presenter.ai"
        description="Your AI digital twin co-hosts live sessions: presents, listens, takes questions — you stay in control."
        icon="mic"
        currentHref="/tools/presenter"
      >
        <PresenterConsole />
      </PersonalToolLayout>
    </AppShell>
  );
}
