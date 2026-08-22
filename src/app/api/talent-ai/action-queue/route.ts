import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoles } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";

type ActionItem = {
  id: string;
  kind: "approval" | "assignment" | "requisition" | "candidate";
  title: string;
  detail: string;
  link: string;
  daysWaiting: number;
};

function daysSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

// One aggregated "what needs my action right now" feed, built from the
// same tables every role-specific screen reads -- this is what a role's
// home page leads with (F002 / F020: action queue + next best action).
export async function GET() {
  let user;
  try {
    ({ user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const myRoles = await getUserRoles(admin, user.id);
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  const isAdmin = !!profile?.is_admin;

  const items: ActionItem[] = [];

  // Approvals waiting on me
  const { data: steps } = await admin
    .from("talent_approval_steps")
    .select("*, talent_requisitions(id, title, created_at)")
    .in("status", ["pending", "hold"]);
  for (const s of steps || []) {
    const mine = s.approver_user_id === user.id || (s.approver_user_id === null && myRoles.includes(s.approver_role));
    if (!mine) continue;
    const req_ = s.talent_requisitions as { id: string; title: string; created_at: string } | null;
    if (!req_) continue;
    const { data: earlier } = await admin
      .from("talent_approval_steps")
      .select("id")
      .eq("requisition_id", s.requisition_id)
      .lt("step_order", s.step_order)
      .neq("status", "approved");
    if (earlier && earlier.length > 0) continue;
    items.push({
      id: `approval-${s.id}`,
      kind: "approval",
      title: `Approve "${req_.title}"`,
      detail: `Waiting on your ${s.approver_role.replace("_", " ")} decision`,
      link: `/tools/talent-ai?requisition=${req_.id}`,
      daysWaiting: daysSince(req_.created_at),
    });
  }

  // TA Head: approved requisitions not yet assigned
  if (myRoles.includes("ta_head") || isAdmin) {
    const { data: approved } = await admin.from("talent_requisitions").select("id, title, created_at").eq("status", "approved");
    const { data: assigned } = await admin.from("talent_requisition_assignment").select("requisition_id");
    const assignedIds = new Set((assigned || []).map((a) => a.requisition_id));
    for (const r of approved || []) {
      if (assignedIds.has(r.id)) continue;
      items.push({
        id: `assign-${r.id}`,
        kind: "assignment",
        title: `Assign a recruiter: "${r.title}"`,
        detail: "Approved and waiting for TA assignment",
        link: `/tools/talent-ai?requisition=${r.id}`,
        daysWaiting: daysSince(r.created_at),
      });
    }
  }

  // Recruiter: candidates at hm_review/interview with no recent movement
  const { data: myAssignments } = await admin.from("talent_requisition_assignment").select("requisition_id").eq("recruiter_id", user.id);
  const myReqIds = (myAssignments || []).map((a) => a.requisition_id);
  if (myReqIds.length) {
    const { data: candidates } = await admin
      .from("talent_candidates")
      .select("id, name, stage, updated_at, requisition_id")
      .in("requisition_id", myReqIds)
      .in("stage", ["applied", "screening"]);
    for (const c of candidates || []) {
      items.push({
        id: `candidate-${c.id}`,
        kind: "candidate",
        title: `Screen ${c.name}`,
        detail: `Sitting in "${c.stage}"`,
        link: `/tools/talent-ai?requisition=${c.requisition_id}`,
        daysWaiting: daysSince(c.updated_at),
      });
    }
  }

  // HM: my own requisitions that are sent back and need edits
  const { data: mine } = await admin.from("talent_requisitions").select("id, title, updated_at").eq("created_by", user.id).eq("status", "sent_back");
  for (const r of mine || []) {
    items.push({
      id: `sentback-${r.id}`,
      kind: "requisition",
      title: `Edit & resubmit "${r.title}"`,
      detail: "Sent back by an approver",
      link: `/tools/talent-ai?requisition=${r.id}`,
      daysWaiting: daysSince(r.updated_at),
    });
  }

  items.sort((a, b) => b.daysWaiting - a.daysWaiting);
  return NextResponse.json({ items });
}
