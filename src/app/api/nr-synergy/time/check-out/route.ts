import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { jsonError } from "../_lib/server";

// POST /api/nr-synergy/time/check-out
// Closes the caller's open work log (own-checkout RLS policy).
export async function POST() {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs("time");
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase } = g;
  const member = ctx.member;
  if (!member) return jsonError("Only members can check out.", 403);

  const { data: open, error: openErr } = await supabase
    .from("nrs_work_logs")
    .select("id")
    .eq("member_id", member.id)
    .is("check_out_at", null)
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openErr) return jsonError(openErr.message, 500);
  if (!open) return jsonError("You're not checked in.", 409);

  const { data, error } = await supabase
    .from("nrs_work_logs")
    .update({ check_out_at: new Date().toISOString() })
    .eq("id", (open as { id: string }).id)
    .is("check_out_at", null)
    .select("id, day, check_in_at, check_out_at, timezone, mode, city, country_code, is_travel")
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("You're not checked in.", 409);
  return NextResponse.json({ log: data });
}
