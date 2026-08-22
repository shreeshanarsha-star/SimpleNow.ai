import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit, notifyUser } from "@/lib/talentRoles";
import { getOrgContext } from "@/lib/org";

// Open to ANY authenticated user, not just Talent.ai-gated staff -- every
// employee can see published internal roles, apply to one themselves, or
// refer someone else.
export async function GET() {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data: requisitions, error } = await supabase
    .from("talent_requisitions")
    .select("id, title, department, location, work_mode, employment_type, job_level, created_at")
    .eq("is_published", true)
    .eq("is_confidential", false)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "Mine" -- every candidate row this employee is behind, whether they
  // applied for themselves (source=internal_application) or referred
  // someone else (source=referral). admin client because an employee has
  // no Talent.ai role/RLS grant on talent_candidates otherwise -- scoped
  // strictly to referred_by = this user, so it can never surface anyone
  // else's activity.
  const admin = createAdminClient();
  const { data: mineRaw } = await admin
    .from("talent_candidates")
    .select("id, name, stage, source, created_at, requisition_id, talent_requisitions(title, department)")
    .eq("referred_by", user.id)
    .order("created_at", { ascending: false });
  const mine = (mineRaw || []).map((c) => ({
    id: c.id,
    name: c.name,
    stage: c.stage,
    source: c.source,
    createdAt: c.created_at,
    requisitionId: c.requisition_id,
    requisitionTitle: (c.talent_requisitions as { title?: string } | null)?.title || "Untitled role",
  }));

  const myApplicationIds = mine.filter((c) => c.source === "internal_application").map((c) => c.id);
  let upcomingInterviews: { id: string; requisitionTitle: string; roundName: string | null; scheduledAt: string | null; mode: string | null }[] = [];
  if (myApplicationIds.length) {
    const { data: interviews } = await admin
      .from("talent_interviews")
      .select("id, round_name, scheduled_at, mode, candidate_id, requisition_id")
      .in("candidate_id", myApplicationIds)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(5);
    const reqTitleById = new Map(mine.map((c) => [c.requisitionId, c.requisitionTitle]));
    upcomingInterviews = (interviews || []).map((iv) => ({
      id: iv.id,
      requisitionTitle: reqTitleById.get(iv.requisition_id) || "Interview",
      roundName: iv.round_name,
      scheduledAt: iv.scheduled_at,
      mode: iv.mode,
    }));
  }

  return NextResponse.json({ requisitions, mine, upcomingInterviews });
}

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const requisitionId = typeof body?.requisitionId === "string" ? body.requisitionId : null;
  const isSelf = body?.isSelf === true;
  let name = typeof body?.name === "string" ? body.name.trim() : "";
  let email = typeof body?.email === "string" ? body.email.trim() : null;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const note = typeof body?.note === "string" ? body.note.trim() : null;

  const admin = createAdminClient();

  // Applying for yourself: name/email always come from your own profile,
  // never from client input -- otherwise "apply as yourself" would just be
  // a referral with extra steps and no real identity guarantee.
  if (isSelf) {
    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    name = profile?.full_name || profile?.email || "Unnamed employee";
    email = profile?.email || null;
  }

  if (!requisitionId || !name) {
    return NextResponse.json({ error: "requisitionId and candidate name are required." }, { status: 400 });
  }

  const { data: requisition } = await admin
    .from("talent_requisitions")
    .select("id, title, is_published, is_confidential, created_by, org_id")
    .eq("id", requisitionId)
    .single();
  if (!requisition || !requisition.is_published || requisition.is_confidential) {
    return NextResponse.json({ error: "This role isn't open for referrals." }, { status: 403 });
  }
  const referrerCtx = await getOrgContext(admin, user.id);
  if (referrerCtx.orgId !== requisition.org_id) {
    return NextResponse.json({ error: "This role isn't open for referrals." }, { status: 403 });
  }

  if (isSelf) {
    const { data: existing } = await admin
      .from("talent_candidates")
      .select("id")
      .eq("requisition_id", requisitionId)
      .eq("referred_by", user.id)
      .eq("source", "internal_application")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "You've already applied to this role." }, { status: 409 });
    }
  }

  const { data: candidate, error } = await admin
    .from("talent_candidates")
    .insert({
      requisition_id: requisitionId,
      name,
      email,
      phone,
      source: isSelf ? "internal_application" : "referral",
      stage: "applied",
      referred_by: user.id,
      created_by: user.id,
      tags: [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("talent_stage_history").insert({
    candidate_id: candidate.id,
    from_stage: null,
    to_stage: "applied",
    changed_by: user.id,
    note: note || (isSelf ? "Applied via internal job board" : "Referred by employee"),
  });

  const { data: assignment } = await admin.from("talent_requisition_assignment").select("recruiter_id").eq("requisition_id", requisitionId).maybeSingle();
  const notifyTarget = assignment?.recruiter_id || requisition.created_by;
  if (notifyTarget) {
    await notifyUser({
      userId: notifyTarget,
      title: isSelf ? `Internal application for "${requisition.title}"` : `New referral for "${requisition.title}"`,
      body: isSelf ? `${name} applied via the internal job board.` : `${name} was referred by an employee.`,
      link: `/tools/talent-ai?requisition=${requisitionId}`,
    });
  }
  await logAudit({ entityType: "talent_candidates", entityId: candidate.id, actorId: user.id, action: isSelf ? "self_applied" : "referred" });

  return NextResponse.json({ candidate }, { status: 201 });
}
