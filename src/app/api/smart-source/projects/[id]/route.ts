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
    .select("id, name, created_at, description, start_date, target_date, target_hires, status, jd_file_name, jd_updated_at")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });

  const { data: rows, error: membersError } = await supabase
    .from("smart_source_project_members")
    .select("id, added_at, status, comments, jd_score, jd_summary, jd_strengths, jd_gaps, smart_source_candidates(*)")
    .eq("project_id", id)
    .order("added_at", { ascending: false });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const candidates = (rows || [])
    .map((r: {
      id: string;
      added_at: string;
      status: string | null;
      comments: string | null;
      jd_score: number | null;
      jd_summary: string | null;
      jd_strengths: string[] | null;
      jd_gaps: string[] | null;
      smart_source_candidates: unknown;
    }) => {
      if (!r.smart_source_candidates || typeof r.smart_source_candidates !== "object") return null;
      // A score against this project's JD (set by the drop box) takes
      // precedence over whatever score the candidate row itself carries from
      // a search; it lives on the member row so it stays per-project.
      const jdScored =
        r.jd_score != null
          ? {
              match_score: r.jd_score,
              evaluation_summary: r.jd_summary,
              evaluation_strengths: r.jd_strengths,
              evaluation_gaps: r.jd_gaps,
            }
          : {};
      return {
        ...(r.smart_source_candidates as Record<string, unknown>),
        ...jdScored,
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

  // Case 1: Updating candidate member status or comments in this project,
  // and/or editable fields on the shared candidate record itself (name,
  // role, contact, CTC/notice) -- those live on smart_source_candidates
  // rather than the per-project member row, since they describe the person,
  // not their status in this one project.
  if (body?.candidateId) {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.status === "string") updateData.status = body.status;
    if (typeof body.comments === "string") updateData.comments = body.comments;

    if (Object.keys(updateData).length > 1) {
      const { error } = await supabase
        .from("smart_source_project_members")
        .update(updateData)
        .eq("project_id", id)
        .eq("candidate_id", body.candidateId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Candidate-level fields -- all optional, all manually editable
    // regardless of whether they were auto-populated (LinkedIn scrape / AI
    // resume parse) or left blank. Empty string clears a field.
    let candidateUpdated = false;
    if (body?.candidate && typeof body.candidate === "object") {
      const c = body.candidate as Record<string, unknown>;
      const candidateUpdates: Record<string, unknown> = {};
      const strField = (key: string) => {
        if (typeof c[key] === "string") candidateUpdates[key] = c[key].trim() || null;
      };
      strField("name");
      strField("designation");
      strField("company");
      strField("location");
      strField("public_email");
      strField("public_phone");
      strField("compensation");
      strField("expected_ctc");
      strField("notice_period");
      if (c.experience_years === null || c.experience_years === "") {
        candidateUpdates.experience_years = null;
      } else if (c.experience_years !== undefined) {
        const exp = Number(c.experience_years);
        if (!isNaN(exp) && exp >= 0 && exp < 70) candidateUpdates.experience_years = exp;
      }

      if (Object.keys(candidateUpdates).length > 0) {
        const { error: candError } = await supabase
          .from("smart_source_candidates")
          .update(candidateUpdates)
          .eq("id", body.candidateId);
        if (candError) {
          return NextResponse.json({ error: candError.message }, { status: 500 });
        }
        candidateUpdated = true;
      }
    }

    return NextResponse.json({ ok: true, status: body.status, comments: body.comments, candidateUpdated });
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
