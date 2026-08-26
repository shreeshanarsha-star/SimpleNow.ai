import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import ContractsEsignApp from "@/components/tools/ContractsEsignApp";

export const dynamic = "force-dynamic";

// Contracts & eSign -- a Personal Tool, same "not feature-gated, owner_id
// alone" rule as Quick Notes / To-Do List (see widgets-ai/page.tsx).
export default async function ContractsEsignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Contracts & eSign">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Contracts & eSign">
      <ContractsEsignApp />
    </AppShell>
  );
}
