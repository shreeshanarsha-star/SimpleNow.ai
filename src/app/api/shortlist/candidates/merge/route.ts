import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Resolves a "possible duplicate" flag (spec section 15): merge folds the
// newer/flagged candidate into the kept one (job matches + notes move
// over, the flagged row and its file are removed); keep_separate marks
// both as confirmed distinct people; ignore just dismisses the banner
// without asserting anything. Never happens silently -- always an
// explicit recruiter action.
export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const flaggedId = typeof body.flaggedId === "string" ? body.flaggedId : "";
  const keepId = typeof body.keepId === "string" ? body.keepId : "";

  if (!flaggedId || !["merge", "keep_separate", "ignore"].includes(action)) {
    return NextResponse.json({ error: "Missing or invalid action/flaggedId." }, { status: 400 });
  }

  const { data: flagged } = await supabase.from("shortlist_candidates").select("*").eq("id", flaggedId).maybeSingle();
  if (!flagged) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  const admin = createAdminClient();

  if (action === "keep_separate" || action === "ignore") {
    const { data: updated, error } = await supabase
      .from("shortlist_candidates")
      .update({ dedupe_status: action === "keep_separate" ? "confirmed_unique" : "none", duplicate_of: null })
      .eq("id", flaggedId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("shortlist_activity_log").insert({
      user_id: user.id,
      entity_type: "candidate",
      entity_id: flaggedId,
      action: action === "keep_separate" ? "duplicate_kept_separate" : "duplicate_ignored",
    });
    return NextResponse.json({ candidate: updated });
  }

  // merge
  const targetId = keepId || flagged.duplicate_of;
  if (!targetId) return NextResponse.json({ error: "No candidate to merge into." }, { status: 400 });
  const { data: target } = await supabase.from("shortlist_candidates").select("id, user_id").eq("id", targetId).maybeSingle();
  if (!target) return NextResponse.json({ error: "Target candidate not found." }, { status: 404 });

  // Move matches, skipping ones the target already has for the same job.
  const { data: flaggedMatches } = await supabase.from("shortlist_job_matches").select("*").eq("candidate_id", flaggedId);
  for (const m of flaggedMatches || []) {
    const { data: existing } = await admin
      .from("shortlist_job_matches")
      .select("id")
      .eq("job_id", m.job_id)
      .eq("candidate_id", targetId)
      .maybeSingle();
    if (existing) {
      await admin.from("shortlist_job_matches").delete().eq("id", m.id);
    } else {
      await admin.from("shortlist_job_matches").update({ candidate_id: targetId }).eq("id", m.id);
    }
  }

  await admin.from("shortlist_candidate_notes").update({ candidate_id: targetId }).eq("candidate_id", flaggedId);

  if (flagged.file_path) {
    await admin.storage.from("shortlist").remove([flagged.file_path]).catch(() => null);
  }
  await admin.from("shortlist_candidates").delete().eq("id", flaggedId);

  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "candidate",
    entity_id: targetId,
    action: "duplicate_merged",
    detail: { merged_from: flaggedId },
  });

  const { data: mergedCandidate } = await supabase.from("shortlist_candidates").select("*").eq("id", targetId).maybeSingle();
  return NextResponse.json({ candidate: mergedCandidate });
}
