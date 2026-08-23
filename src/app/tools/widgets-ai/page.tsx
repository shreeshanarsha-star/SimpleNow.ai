import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import PersonalToolsView from "@/components/tools/personal/PersonalToolsView";

export const dynamic = "force-dynamic";

// Personal Tools -- deliberately NOT feature-gated like the department
// tools. Per PERSONAL_TOOLS in departments.ts, these are small everyday
// utilities available to anyone signed in, regardless of org/department/
// approval status (Calculator/Clock/Timer/Unit Converter don't even touch
// the database; Notes/To-Do/Calendar are owned by user_id alone).
export default async function WidgetsAiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Personal Tools">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Personal Tools">
      <PersonalToolsView />
    </AppShell>
  );
}
