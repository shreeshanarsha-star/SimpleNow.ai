import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import TodoList from "@/components/tools/personal/TodoList";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function TodoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="To-Do List">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="To-Do List">
      <PersonalToolLayout
        title="To-Do List"
        description="Everyday task management, due dates, and completion tracking."
        icon="check"
        currentHref="/tools/todo"
        licensedTools={licensedTools}
      >
        <TodoList />
      </PersonalToolLayout>
    </AppShell>
  );
}
