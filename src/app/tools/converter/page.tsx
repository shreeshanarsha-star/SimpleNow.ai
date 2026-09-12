import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import UnitConverter from "@/components/tools/personal/UnitConverter";
import PersonalToolLayout from "@/components/tools/personal/PersonalToolLayout";
import { getLicensedToolsForUser } from "@/lib/licensedTools";

export const dynamic = "force-dynamic";

export default async function ConverterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Unit Converter">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const licensedTools = await getLicensedToolsForUser(supabase, user.id);

  return (
    <AppShell title="Unit Converter">
      <PersonalToolLayout
        title="Unit Converter"
        description="Instant conversions for live currencies, length, weight, temperature, and data storage."
        icon="chart"
        currentHref="/tools/converter"
        licensedTools={licensedTools}
      >
        <UnitConverter />
      </PersonalToolLayout>
    </AppShell>
  );
}
