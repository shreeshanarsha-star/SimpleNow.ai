import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: project, error: projectError } = await supabase
    .from("smart_source_projects")
    .select("id, name, created_at")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });

  const { data: rows, error: membersError } = await supabase
    .from("smart_source_project_members")
    .select("added_at, smart_source_candidates(*)")
    .eq("project_id", id)
    .order("added_at", { ascending: false });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const candidates = (rows || [])
    .map((r: { smart_source_candidates: unknown }) => r.smart_source_candidates)
    .filter(Boolean);

  return NextResponse.json({ project, candidates });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const candidateId = searchParams.get("candidateId");
  if (!candidateId) {
    return NextResponse.json({ error: "Missing candidateId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("smart_source_project_members")
    .delete()
    .eq("project_id", id)
    .eq("candidate_id", candidateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
