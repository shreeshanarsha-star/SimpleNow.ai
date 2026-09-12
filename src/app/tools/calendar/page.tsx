import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import CalendarWidget from "@/components/tools/personal/CalendarWidget";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Calendar">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="Calendar">
      <PersonalToolLayout
        title="Calendar"
        description="Monthly schedule, event planning, and day-by-day agenda tracking."
        icon="calendar"
        currentHref="/tools/calendar"
        licensedTools={licensedTools}
      >
        <CalendarWidget />
      </PersonalToolLayout>
    </AppShell>
  );
}
