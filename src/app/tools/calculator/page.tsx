import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import Calculator from "@/components/tools/personal/Calculator";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Calculator">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="Calculator">
      <PersonalToolLayout
        title="Calculator"
        description="Standard math, GST tax, margin & profit, and EMI calculations with voice input."
        icon="calculator"
        currentHref="/tools/calculator"
        licensedTools={licensedTools}
      >
        <Calculator />
      </PersonalToolLayout>
    </AppShell>
  );
}
