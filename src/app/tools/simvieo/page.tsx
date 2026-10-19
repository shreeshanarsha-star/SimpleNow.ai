import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import SimVieoStudio from "@/components/tools/simvieo/SimVieoStudio";

export const metadata: Metadata = {
  title: "SimVieo — Free AI marketing video creator | SimpleNow.ai",
  description:
    "Turn an idea, product images and your logo into a polished marketing video with script, captions, voiceover and music. Free, no sign-up.",
};

// SimVieo -- a Personal Tool that needs no login (listed in middleware's
// GUEST_ACCESSIBLE_PATHS). All rendering happens in the visitor's browser;
// the only server work is the AI plan/voice calls, which are rate-limited
// and budget-capped in lib/simvieo/usage.ts.
export default function SimVieoPage() {
  return (
    <AppShell title="SimVieo">
      <PersonalToolLayout
        title="SimVieo"
        description="Free AI marketing video creator — idea, images and logo in; a ready-to-post MP4 out."
        icon="film"
        currentHref="/tools/simvieo"
      >
        <SimVieoStudio />
      </PersonalToolLayout>
    </AppShell>
  );
}
