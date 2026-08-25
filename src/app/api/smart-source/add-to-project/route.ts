import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";

type CandidateInput = {
  profile_url: string;
  name: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  experience_years: number | null;
  qualification: string | null;
  match_score: number | null;
  internal_person_id: string | null;
};

// Files a Smart Source.ai search result into the same pipeline Talent.ai
// already uses: a talent_people identity row (reused if this candidate was
// already cross-matched) + a talent_candidates application row scoped to
// the chosen requisition (required -- talent_candidates.requisition_id is
// NOT NULL, matching every other candidate-entry path in the app), landing
// at the "applied" stage. Optionally also files it into a project list
// (talent_candidate_lists), creating a new list on the fly if asked.
export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const candidates: CandidateInput[] = Array.isArray(body?.candidates) ? body.candidates : [];
  const requisitionId = typeof body?.requisitionId === "string" ? body.requisitionId : null;
  const listId = typeof body?.listId === "string" ? body.listId : null;
  const newListName = typeof body?.newListName === "string" ? body.newListName.trim() : "";

  if (!candidates.length) {
    return NextResponse.json({ error: "Select at least one candidate first." }, { status: 400 });
  }
  if (!requisitionId) {
    return NextResponse.json({ error: "Choose a requisition to file these candidates under." }, { status: 400 });
  }

  const { data: requisition } = await supabase
    .from("talent_requisitions")
    .select("id")
    .eq("id", requisitionId)
    .maybeSingle();
  if (!requisition) {
    return NextResponse.json({ error: "That requisition couldn't be found." }, { status: 404 });
  }

  let targetListId = listId;
  if (!targetListId && newListName) {
    const { data: list, error: listError } = await supabase
      .from("talent_candidate_lists")
      .insert({ name: newListName, created_by: user.id, org_id: orgId })
      .select()
      .single();
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    targetListId = list.id;
  }

  const createdCandidateIds: string[] = [];
  const results: { profile_url: string; ok: boolean; error?: string }[] = [];

  for (const c of candidates) {
    try {
      let personId = c.internal_person_id;
      if (!personId) {
        const { data: person, error: personError } = await supabase
          .from("talent_people")
          .insert({
            org_id: orgId,
            name: c.name || "Unnamed candidate",
            current_company: c.company,
            current_location: c.location,
            linkedin_url: c.profile_url,
            experience_years: c.experience_years,
            qualification: c.qualification,
            source: "Smart Source.ai",
            created_by: user.id,
          })
          .select()
          .single();
        if (personError || !person) throw new Error(personError?.message || "Could not create candidate record.");
        personId = person.id;
      }

      const { data: candidateRow, error: candError } = await supabase
        .from("talent_candidates")
        .insert({
          requisition_id: requisitionId,
          person_id: personId,
          name: c.name || "Unnamed candidate",
          current_company: c.company,
          current_location: c.location,
          linkedin_url: c.profile_url,
          experience_years: c.experience_years,
          qualification: c.qualification,
          match_score: c.match_score,
          source: "Smart Source.ai",
          stage: "applied",
          created_by: user.id,
        })
        .select()
        .single();
      if (candError || !candidateRow) throw new Error(candError?.message || "Could not add this candidate.");

      createdCandidateIds.push(candidateRow.id);
      results.push({ profile_url: c.profile_url, ok: true });
    } catch (err) {
      results.push({ profile_url: c.profile_url, ok: false, error: err instanceof Error ? err.message : "Failed." });
    }
  }

  if (targetListId && createdCandidateIds.length) {
    await supabase
      .from("talent_candidate_list_members")
      .upsert(
        createdCandidateIds.map((candidate_id) => ({ list_id: targetListId, candidate_id, added_by: user.id })),
        { onConflict: "list_id,candidate_id" }
      );
  }

  const anyFailed = results.some((r) => !r.ok);
  return NextResponse.json({ results, listId: targetListId }, { status: anyFailed ? 207 : 200 });
}
