import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import ClockWidget from "@/components/tools/personal/ClockWidget";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function ClockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Clock">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="Clock">
      <PersonalToolLayout
        title="World Clock"
        description="Global time zones, live interactive world map, daylight tracking, and weather."
        icon="clock"
        currentHref="/tools/clock"
        licensedTools={licensedTools}
      >
        <ClockWidget />
      </PersonalToolLayout>
    </AppShell>
  );
}
