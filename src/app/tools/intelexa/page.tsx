import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import IntelexaApp from "@/components/tools/intelexa/IntelexaApp";

export const dynamic = "force-dynamic";

export default async function IntelexaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Intelexa.ai">
        <div className="max-w-xl mx-auto mt-16 p-8 border border-dashed border-border rounded-2xl text-center bg-surface shadow-soft">
          <div className="w-12 h-12 rounded-full bg-brand-wash text-brand mx-auto flex items-center justify-center font-bold text-xl mb-4">
            ⚡
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Welcome to Intelexa.ai</h2>
          <p className="text-sm text-ink-muted mb-6">
            Please sign in to access your personal event intelligence copilot.
          </p>
          <a
            href="/login?next=/tools/intelexa"
            className="inline-block px-5 py-2.5 bg-brand text-white font-semibold text-sm rounded-xl hover:bg-brand/90 shadow-sm"
          >
            Sign In to SimpleNow.ai
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Intelexa.ai">
      <IntelexaApp initialUser={{ id: user.id, email: user.email || "" }} />
    </AppShell>
  );
}
