import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const FEATURE_KEY = "Talent.ai";

// "Hiring manager" isn't a gated role you need to hold to see this --
// anyone who has created a requisition (the requester) or has direct
// reports (profiles.manager_id = them) is acting as one, which matches
// how requisition creation actually works in this app (no role check on
// who can request a role). Self-hides on the client if there's nothing
// to show, rather than being gated behind a role most people requesting
// a hire were never explicitly assigned.
export async function GET() {
  let user, orgId;
  try {
    ({ user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();

  const { data: myTeamRaw } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("manager_id", user.id)
    .eq("org_id", orgId);
  const myTeam = myTeamRaw || [];
  const teamIds = myTeam.map((t) => t.id);
  const { data: teamRoles } = teamIds.length
    ? await admin.from("talent_user_roles").select("user_id, role").in("user_id", teamIds)
    : { data: [] as { user_id: string; role: string }[] };
  const rolesByUser = new Map<string, string[]>();
  for (const r of teamRoles || []) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  }
  const myTeamWithRoles = myTeam.map((t) => ({ id: t.id, name: t.full_name || t.email, roles: rolesByUser.get(t.id) || [] }));

  const { data: myReqsRaw } = await admin
    .from("talent_requisitions")
    .select("id, title, department, status, created_at")
    .eq("created_by", user.id)
    .eq("org_id", orgId);
  const myRequisitions = myReqsRaw || [];
  const reqIds = myRequisitions.map((r) => r.id);

  const { data: cands } = reqIds.length
    ? await admin.from("talent_candidates").select("id, name, stage, updated_at, requisition_id").in("requisition_id", reqIds)
    : { data: [] as { id: string; name: string; stage: string; updated_at: string; requisition_id: string }[] };
  const candidates = cands || [];
  const reqById = new Map(myRequisitions.map((r) => [r.id, r]));

  const myRequisitionsWithCounts = myRequisitions.map((r) => {
    const reqCandidates = candidates.filter((c) => c.requisition_id === r.id);
    return {
      id: r.id,
      title: r.title,
      department: r.department,
      status: r.status,
      candidateCount: reqCandidates.length,
      inInterviewCount: reqCandidates.filter((c) => ["hm_review", "interview"].includes(c.stage)).length,
    };
  });

  const candidatesInInterview = candidates
    .filter((c) => ["hm_review", "interview"].includes(c.stage))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      requisitionTitle: reqById.get(c.requisition_id)?.title || "Requisition",
      requisitionId: c.requisition_id,
    }));

  const { data: pendingSteps } = await admin
    .from("talent_approval_steps")
    .select("id")
    .eq("approver_user_id", user.id)
    .eq("status", "pending");

  return NextResponse.json({
    counts: {
      myTeam: myTeamWithRoles.length,
      myRequisitions: myRequisitionsWithCounts.length,
      candidatesInInterview: candidatesInInterview.length,
      pendingApprovalsFromMe: (pendingSteps || []).length,
    },
    myTeam: myTeamWithRoles,
    myRequisitions: myRequisitionsWithCounts,
    candidatesInInterview,
  });
}
