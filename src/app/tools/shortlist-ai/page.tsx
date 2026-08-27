import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import ShortlistApp from "@/components/tools/ShortlistApp";

export const dynamic = "force-dynamic";

// Shortlist.ai -- Personal Tool, same "not feature-gated, owner_id alone"
// rule as Quick Notes / To-Do List / Contracts & eSign / Jotz.
export default async function ShortlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Shortlist.ai">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Shortlist.ai">
      <ShortlistApp />
    </AppShell>
  );
}
