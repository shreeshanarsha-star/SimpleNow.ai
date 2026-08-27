import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import JotzApp from "@/components/tools/JotzApp";

export const dynamic = "force-dynamic";

// Jotz -- a Personal Tool, same "not feature-gated, owner_id alone" rule
// as Quick Notes / To-Do List / Contracts & eSign (see widgets-ai/page.tsx
// and contracts-esign/page.tsx).
export default async function JotzPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Jotz">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Jotz">
      <JotzApp />
    </AppShell>
  );
}
