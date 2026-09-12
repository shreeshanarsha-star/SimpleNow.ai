import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import QuickNotes from "@/components/tools/personal/QuickNotes";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Quick Notes">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="Quick Notes">
      <PersonalToolLayout
        title="Quick Notes"
        description="Fast capture, markdown formatting, and voice notes synced to your account."
        icon="book"
        currentHref="/tools/notes"
        licensedTools={licensedTools}
      >
        <QuickNotes />
      </PersonalToolLayout>
    </AppShell>
  );
}
