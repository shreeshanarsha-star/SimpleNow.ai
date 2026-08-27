import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["new", "reviewed", "shortlisted", "shared", "interview", "selected", "rejected", "on_hold"];

// Bulk status change across selected matches (spec section 19). Applies
// one at a time server-side (small N at Personal Tool scale) so each
// change still gets its own history row, same as a single-match update.
export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const matchIds: string[] = Array.isArray(body.matchIds) ? body.matchIds.filter((s: unknown) => typeof s === "string") : [];
  const status = body.status as string;
  if (!matchIds.length) return NextResponse.json({ error: "No candidates selected." }, { status: 400 });
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const admin = createAdminClient();
  let updated = 0;
  for (const matchId of matchIds) {
    const { data: existing } = await supabase
      .from("shortlist_job_matches")
      .select("status, candidate_id")
      .eq("id", matchId)
      .maybeSingle();
    if (!existing) continue;
    const { error } = await supabase.from("shortlist_job_matches").update({ status }).eq("id", matchId);
    if (error) continue;
    updated++;
    await admin.from("shortlist_status_history").insert({
      user_id: user.id,
      match_id: matchId,
      from_status: existing.status,
      to_status: status,
      changed_by: "user",
    });
    await admin.from("shortlist_activity_log").insert({
      user_id: user.id,
      entity_type: "candidate",
      entity_id: existing.candidate_id,
      action: "status_changed",
      detail: { match_id: matchId, from: existing.status, to: status, bulk: true },
    });
  }

  return NextResponse.json({ updated, total: matchIds.length });
}
