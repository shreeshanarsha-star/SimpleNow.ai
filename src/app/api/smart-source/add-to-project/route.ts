import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";

type CandidateInput = {
  id: string; // smart_source_candidates.id
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

// Two independent save paths -- either or both can run per request:
//  - Requisition (optional): files each candidate into the Talent.ai ATS
//    pipeline (talent_people + talent_candidates, "applied" stage). Only
//    usable by orgs with Talent.ai access.
//  - Project (optional): saves each candidate into a Smart-Source-only
//    project (smart_source_projects/members), which has no ATS dependency
//    at all -- this is what lets an org without Talent.ai still save
//    sourced candidates for later.
// At least one of the two must be chosen; otherwise there's nowhere to
// save. Neither one is mandatory on its own -- that was the bug: this used
// to hard-require a requisition, which made the feature unusable for orgs
// that haven't subscribed to Talent.ai.
export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const candidates: CandidateInput[] = Array.isArray(body?.candidates) ? body.candidates : [];
  const requisitionId = typeof body?.requisitionId === "string" && body.requisitionId ? body.requisitionId : null;
  const listId = typeof body?.listId === "string" && body.listId ? body.listId : null;
  const newListName = typeof body?.newListName === "string" ? body.newListName.trim() : "";

  if (!candidates.length) {
    return NextResponse.json({ error: "Select at least one candidate first." }, { status: 400 });
  }
  if (!requisitionId && !listId && !newListName) {
    return NextResponse.json(
      { error: "Choose a requisition or a project to save these candidates to." },
      { status: 400 }
    );
  }

  if (requisitionId) {
    const { data: requisition } = await supabase
      .from("talent_requisitions")
      .select("id")
      .eq("id", requisitionId)
      .maybeSingle();
    if (!requisition) {
      return NextResponse.json({ error: "That requisition couldn't be found." }, { status: 404 });
    }
  }

  let targetProjectId = listId;
  if (!targetProjectId && newListName) {
    const { data: project, error: projectError } = await supabase
      .from("smart_source_projects")
      .insert({ name: newListName, created_by: user.id, org_id: orgId })
      .select()
      .single();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    targetProjectId = project.id;
  }

  const results: { profile_url: string; ok: boolean; error?: string }[] = [];

  for (const c of candidates) {
    try {
      if (requisitionId) {
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

        const { error: candError } = await supabase.from("talent_candidates").insert({
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
        });
        if (candError) throw new Error(candError.message);
      }

      if (targetProjectId) {
        if (!c.id) throw new Error("Missing candidate reference.");
        const { error: memberError } = await supabase
          .from("smart_source_project_members")
          .upsert(
            { project_id: targetProjectId, candidate_id: c.id, added_by: user.id },
            { onConflict: "project_id,candidate_id" }
          );
        if (memberError) throw new Error(memberError.message);
      }

      results.push({ profile_url: c.profile_url, ok: true });
    } catch (err) {
      results.push({ profile_url: c.profile_url, ok: false, error: err instanceof Error ? err.message : "Failed." });
    }
  }

  const anyFailed = results.some((r) => !r.ok);
  return NextResponse.json({ results, projectId: targetProjectId }, { status: anyFailed ? 207 : 200 });
}
