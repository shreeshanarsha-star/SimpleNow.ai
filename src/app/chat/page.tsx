import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import ChatPanel from "@/components/ChatPanel";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Team Chat">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return (
      <AppShell title="Team Chat">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Your account isn&apos;t part of an organization yet.
        </div>
      </AppShell>
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", profile.org_id)
    .maybeSingle();

  if (org?.status !== "approved" && !profile.is_admin) {
    return (
      <AppShell title="Team Chat">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Your organization is still pending approval from the platform owner.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Team Chat">
      <ChatPanel meId={user.id} />
    </AppShell>
  );
}
