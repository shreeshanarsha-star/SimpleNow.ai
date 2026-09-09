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
    .select("id, name, created_at, description, start_date, target_date, target_hires, status")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });

  const { data: rows, error: membersError } = await supabase
    .from("smart_source_project_members")
    .select("id, added_at, status, comments, smart_source_candidates(*)")
    .eq("project_id", id)
    .order("added_at", { ascending: false });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const candidates = (rows || [])
    .map((r: { id: string; added_at: string; status: string | null; comments: string | null; smart_source_candidates: unknown }) => {
      if (!r.smart_source_candidates || typeof r.smart_source_candidates !== "object") return null;
      return {
        ...(r.smart_source_candidates as Record<string, unknown>),
        project_member_id: r.id,
        project_status: r.status || "CV Screened",
        project_comments: r.comments || "",
        added_at: r.added_at,
      };
    })
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

  if (candidateId) {
    const { error } = await supabase
      .from("smart_source_project_members")
      .delete()
      .eq("project_id", id)
      .eq("candidate_id", candidateId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("smart_source_projects")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);

  // Case 1: Updating candidate member status or comments in this project
  if (body?.candidateId) {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.status === "string") updateData.status = body.status;
    if (typeof body.comments === "string") updateData.comments = body.comments;

    const { error } = await supabase
      .from("smart_source_project_members")
      .update(updateData)
      .eq("project_id", id)
      .eq("candidate_id", body.candidateId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: body.status, comments: body.comments });
  }

  // Case 2: Updating project details (name, description, timelines, target_hires, status)
  const updates: Record<string, unknown> = {};
  if (typeof body?.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Please enter a project name." }, { status: 400 });
    }
    updates.name = trimmed;
  }
  if (typeof body?.description === "string") {
    updates.description = body.description.trim();
  }
  if (body?.start_date !== undefined) {
    updates.start_date = body.start_date ? String(body.start_date).slice(0, 10) : null;
  }
  if (body?.target_date !== undefined) {
    updates.target_date = body.target_date ? String(body.target_date).slice(0, 10) : null;
  }
  if (body?.target_hires !== undefined) {
    const hiresNum = Number(body.target_hires);
    if (!isNaN(hiresNum) && hiresNum > 0) {
      updates.target_hires = hiresNum;
    }
  }
  if (typeof body?.status === "string" && body.status.trim()) {
    updates.status = body.status.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data: project, error } = await supabase
    .from("smart_source_projects")
    .update(updates)
    .eq("id", id)
    .select("id, name, created_at, description, start_date, target_date, target_hires, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project });
}
