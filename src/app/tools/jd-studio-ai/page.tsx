import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import JdStudioApp from "@/components/tools/JdStudioApp";

export const dynamic = "force-dynamic";

// JD Studio.ai -- a Personal Tool, same "requireUser() only, owner_id
// alone" rule as Jotz / Shortlist.ai / Contracts & eSign.
export default async function JdStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="JD Studio.ai">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="JD Studio.ai">
      <JdStudioApp />
    </AppShell>
  );
}
