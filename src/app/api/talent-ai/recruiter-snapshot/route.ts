import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const FEATURE_KEY = "Talent.ai";

// "My requisitions" for a recruiter = requisitions they're actually
// assigned to (talent_requisition_assignment), same data-access rule
// used everywhere else in the app (action-queue, workflow routes) --
// not every requisition in the org. TA Heads/admins already have a
// separate, real org-wide view (Admin dashboard, Funnel & Sources); this
// endpoint intentionally does NOT expand scope for them, so "my
// requisitions" keeps meaning the same thing everywhere it's shown.
export async function GET() {
  let user, orgId;
  try {
    ({ user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();

  const { data: assignments } = await admin
    .from("talent_requisition_assignment")
    .select("requisition_id, assigned_at")
    .eq("recruiter_id", user.id);
  const reqIds = (assignments || []).map((a) => a.requisition_id);

  if (reqIds.length === 0) {
    return NextResponse.json({
      counts: { myRequisitions: 0, activeCandidates: 0, interviewsToday: 0, offersInProgress: 0 },
      myRequisitions: [],
      interviewsToday: [],
      recentCandidates: [],
    });
  }

  const { data: requisitions } = await admin
    .from("talent_requisitions")
    .select("id, title, department, status, headcount")
    .in("id", reqIds)
    .eq("org_id", orgId);
  const reqById = new Map((requisitions || []).map((r) => [r.id, r]));

  const { data: candidates } = await admin
    .from("talent_candidates")
    .select("id, name, stage, updated_at, created_at, requisition_id")
    .in("requisition_id", reqIds);
  const allCandidates = candidates || [];

  const myRequisitions = (requisitions || []).map((r) => {
    const reqCandidates = allCandidates.filter((c) => c.requisition_id === r.id);
    return {
      id: r.id,
      title: r.title,
      department: r.department,
      status: r.status,
      headcount: r.headcount,
      candidateCount: reqCandidates.length,
      activeCandidateCount: reqCandidates.filter((c) => c.stage !== "rejected").length,
    };
  });

  const activeCandidates = allCandidates.filter((c) => c.stage !== "rejected").length;
  const offersInProgress = allCandidates.filter((c) => c.stage === "offer").length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const { data: interviews } = await admin
    .from("talent_interviews")
    .select("id, round_name, scheduled_at, mode, candidate_id, requisition_id")
    .in("requisition_id", reqIds)
    .gte("scheduled_at", todayStart.toISOString())
    .lte("scheduled_at", todayEnd.toISOString())
    .order("scheduled_at", { ascending: true });
  const candidateNameById = new Map(allCandidates.map((c) => [c.id, c.name]));
  const interviewsToday = (interviews || []).map((iv) => ({
    id: iv.id,
    candidateName: candidateNameById.get(iv.candidate_id) || "Candidate",
    requisitionTitle: reqById.get(iv.requisition_id)?.title || "Requisition",
    roundName: iv.round_name,
    scheduledAt: iv.scheduled_at,
    mode: iv.mode,
  }));

  const recentCandidates = allCandidates
    .slice()
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      requisitionTitle: reqById.get(c.requisition_id)?.title || "Requisition",
      requisitionId: c.requisition_id,
      updatedAt: c.updated_at || c.created_at,
    }));

  return NextResponse.json({
    counts: {
      myRequisitions: myRequisitions.length,
      activeCandidates,
      interviewsToday: interviewsToday.length,
      offersInProgress,
    },
    myRequisitions,
    interviewsToday,
    recentCandidates,
  });
}
