import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import TimerStopwatch from "@/components/tools/personal/TimerStopwatch";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function TimerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Timer / Stopwatch">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="Timer / Stopwatch">
      <PersonalToolLayout
        title="Timer / Stopwatch"
        description="Countdown timer, high-precision lap stopwatch, and audio alarm alerts."
        icon="play"
        currentHref="/tools/timer"
        licensedTools={licensedTools}
      >
        <TimerStopwatch />
      </PersonalToolLayout>
    </AppShell>
  );
}
