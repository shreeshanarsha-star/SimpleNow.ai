import { NextResponse } from "next/server";
import { guard, isIsoDate, isUuid, jsonError, memberTimezone, mondayInTz, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { isProjectStatus } from "@/app/tools/nr-synergy/projects/_lib";

// POST: upsert the caller's weekly update for a project (week_of = Monday
// in the member's home-country timezone). Owners may also roll the update's
// status / milestone / overall % onto the project row. User (RLS) client:
// nrs_project_updates allows own insert/update; nrs_projects allows owner writes.
export async function POST(req: Request) {
  const g = await guard("projects");
  if (!g.ok) return g.res;
  const { member, supabase } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");

  const projectId = body.project_id;
  if (!isUuid(projectId)) return jsonError("project_id is required");
  if (!isProjectStatus(body.status)) return jsonError("Choose a valid status");
  const progress = optText(body.progress, 4000);
  if (!progress) return jsonError("Please describe your progress");
  const challenges = optText(body.challenges, 4000);
  const plan = optText(body.plan_of_action, 4000);
  const milestone = optText(body.next_milestone, 300);
  if (challenges === undefined || plan === undefined || milestone === undefined) return jsonError("A field is too long");
  const milestoneOn = body.next_milestone_on == null || body.next_milestone_on === "" ? null : body.next_milestone_on;
  if (milestoneOn !== null && !isIsoDate(milestoneOn)) return jsonError("Milestone date must be yyyy-mm-dd");
  const helpId = body.help_needed_member_id == null || body.help_needed_member_id === "" ? null : body.help_needed_member_id;
  if (helpId !== null && !isUuid(helpId)) return jsonError("Invalid help-needed member");
  if (helpId === member.id) return jsonError("Choose someone other than yourself");
  let pct: number | null = null;
  if (body.progress_pct != null) {
    if (typeof body.progress_pct !== "number" || !Number.isInteger(body.progress_pct) || body.progress_pct < 0 || body.progress_pct > 100) {
      return jsonError("Progress must be a whole number from 0 to 100");
    }
    pct = body.progress_pct;
  }

  const { data: projData, error: pErr } = await supabase
    .from("nrs_projects")
    .select("id, org_id, owner_member_id, archived_at")
    .eq("id", projectId)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (pErr) return jsonError(pErr.message, 500);
  const project = projData as { id: string; org_id: string; owner_member_id: string; archived_at: string | null } | null;
  if (!project || project.archived_at) return jsonError("Project not found", 404);

  const isOwner = project.owner_member_id === member.id;
  if (!isOwner) {
    const { data: link } = await supabase
      .from("nrs_project_members")
      .select("member_id")
      .eq("project_id", project.id)
      .eq("member_id", member.id)
      .maybeSingle();
    if (!link) return jsonError("You're not on this project", 403);
  }

  if (helpId) {
    const { data: helper } = await supabase
      .from("nrs_members")
      .select("id")
      .eq("id", helpId)
      .eq("org_id", member.org_id)
      .eq("status", "active")
      .maybeSingle();
    if (!helper) return jsonError("That colleague wasn't found");
  }

  const weekOf = mondayInTz(await memberTimezone(supabase, member));
  const { data: saved, error: upErr } = await supabase
    .from("nrs_project_updates")
    .upsert(
      {
        org_id: member.org_id,
        project_id: project.id,
        member_id: member.id,
        week_of: weekOf,
        status: body.status,
        progress,
        challenges,
        plan_of_action: plan,
        help_needed_member_id: helpId,
        next_milestone: milestone,
        next_milestone_on: milestoneOn,
      },
      { onConflict: "project_id,member_id,week_of" }
    )
    .select("id")
    .single();
  if (upErr) return jsonError(upErr.message, 500);

  if (isOwner) {
    const patch: Record<string, string | number | null> = {
      status: body.status,
      next_milestone: milestone,
      next_milestone_on: milestoneOn,
    };
    if (pct !== null) patch.progress_pct = pct;
    const { error: projUpErr } = await supabase.from("nrs_projects").update(patch).eq("id", project.id);
    if (projUpErr) return jsonError(projUpErr.message, 500);
  }

  return NextResponse.json({ ok: true, id: (saved as { id: string }).id, week_of: weekOf });
}
