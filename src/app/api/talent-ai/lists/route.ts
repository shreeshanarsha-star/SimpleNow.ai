import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

// Recruiter candidate lists -- "add to new or existing list" for shortlists,
// future-reference pools, or a mailing group. RLS lets any Talent.ai user
// create/manage lists directly (createClient, not the admin client).
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { data: lists, error } = await supabase
    .from("talent_candidate_lists")
    .select("*, talent_candidate_list_members(candidate_id)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lists });
}

export async function POST(req: Request) {
  let supabase, user, orgId;
  try {
    ({ supabase, user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "create";

  if (action === "create") {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "List name is required." }, { status: 400 });
    const { data: list, error } = await supabase
      .from("talent_candidate_lists")
      .insert({ name, description: body.description || null, created_by: user.id, org_id: orgId })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ list }, { status: 201 });
  }

  if (action === "add_members") {
    const listId = typeof body?.listId === "string" ? body.listId : null;
    const candidateIds: string[] = Array.isArray(body?.candidateIds) ? body.candidateIds : [];
    if (!listId || candidateIds.length === 0) {
      return NextResponse.json({ error: "listId and candidateIds are required." }, { status: 400 });
    }
    const rows = candidateIds.map((candidate_id) => ({ list_id: listId, candidate_id, added_by: user.id }));
    const { error } = await supabase.from("talent_candidate_list_members").upsert(rows, { onConflict: "list_id,candidate_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_member") {
    const listId = typeof body?.listId === "string" ? body.listId : null;
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : null;
    if (!listId || !candidateId) return NextResponse.json({ error: "listId and candidateId are required." }, { status: 400 });
    const { error } = await supabase.from("talent_candidate_list_members").delete().eq("list_id", listId).eq("candidate_id", candidateId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
