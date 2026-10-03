import type { SupabaseClient } from "@supabase/supabase-js";
import { countryTimezone } from "../../time/_lib/server";

interface CorrectionRow {
  id: string;
  org_id: string;
  member_id: string;
  work_log_id: string | null;
  day: string;
  proposed_check_in: string | null;
  proposed_check_out: string | null;
  status: string;
}

/**
 * Once a correction is fully approved, write it into the work log (update
 * the linked log, or create one for a missed day) and mark it 'applied'.
 * Best-effort: the approval itself already stands, so failures are returned
 * as a message rather than thrown.
 */
export async function applyCorrection(admin: SupabaseClient, correctionId: string): Promise<{ error: string | null }> {
  const { data, error } = await admin
    .from("nrs_corrections")
    .select("id, org_id, member_id, work_log_id, day, proposed_check_in, proposed_check_out, status")
    .eq("id", correctionId)
    .maybeSingle();
  if (error) return { error: error.message };
  const c = data as CorrectionRow | null;
  if (!c || c.status !== "approved") return { error: null };

  if (c.work_log_id) {
    const patch: Record<string, string> = { source: "correction" };
    if (c.proposed_check_in) patch.check_in_at = c.proposed_check_in;
    if (c.proposed_check_out) patch.check_out_at = c.proposed_check_out;
    const { error: upErr } = await admin.from("nrs_work_logs").update(patch).eq("id", c.work_log_id);
    if (upErr) return { error: upErr.message };
  } else {
    if (!c.proposed_check_in) return { error: "No check-in time to apply." };
    const { data: m } = await admin.from("nrs_members").select("home_country").eq("id", c.member_id).maybeSingle();
    const home = (m as { home_country: string } | null)?.home_country ?? "";
    const tz = await countryTimezone(admin, c.org_id, home);
    const { error: insErr } = await admin.from("nrs_work_logs").insert({
      org_id: c.org_id,
      member_id: c.member_id,
      day: c.day,
      check_in_at: c.proposed_check_in,
      check_out_at: c.proposed_check_out,
      timezone: tz,
      mode: "office",
      source: "correction",
    });
    if (insErr) return { error: insErr.message };
  }

  const { error: stErr } = await admin.from("nrs_corrections").update({ status: "applied" }).eq("id", c.id);
  return { error: stErr?.message ?? null };
}
