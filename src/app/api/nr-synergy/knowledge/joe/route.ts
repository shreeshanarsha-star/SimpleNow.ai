import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";

// POST { step, reflection? }: mark a JOE step complete for the caller, or
// update the private reflection on a step already completed. `step` is
// 'md_message' or the id of one of the org's values.
// First completion uses the user client (own-insert policy). Editing a
// reflection needs an UPDATE, which RLS doesn't grant, so it goes through
// the service-role client after the checks above, scoped to the caller's row.
export async function POST(req: Request) {
  const g = await guard("knowledge");
  if (!g.ok) return g.res;
  const { member, supabase } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");
  const step = body.step;
  const reflection = optText(body.reflection, 4000);
  if (reflection === undefined) return jsonError("Reflection is too long (4000 characters max)");

  if (step === "md_message") {
    const { data } = await supabase.from("nrs_joe_media").select("org_id").eq("org_id", member.org_id).maybeSingle();
    if (!data) return jsonError("The MD's message hasn't been published yet", 404);
  } else if (isUuid(step)) {
    const { data } = await supabase.from("nrs_values").select("id").eq("id", step).eq("org_id", member.org_id).maybeSingle();
    if (!data) return jsonError("Unknown journey step", 404);
  } else {
    return jsonError("Unknown journey step");
  }

  const { data: existing, error: exErr } = await supabase
    .from("nrs_joe_progress")
    .select("step")
    .eq("member_id", member.id)
    .eq("step", step)
    .maybeSingle();
  if (exErr) return jsonError(exErr.message, 500);

  if (!existing) {
    const { error } = await supabase
      .from("nrs_joe_progress")
      .insert({ member_id: member.id, org_id: member.org_id, step, reflection });
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, completed: true });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("nrs_joe_progress")
    .update({ reflection })
    .eq("member_id", member.id)
    .eq("org_id", member.org_id)
    .eq("step", step);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, completed: true });
}
