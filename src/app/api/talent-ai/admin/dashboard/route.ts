import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Org admin (or platform owner) dashboard summary -- every number here is
// computed from the same tables the rest of Talent.ai reads/writes, scoped
// to the caller's org. Deliberately does NOT include a "Hired" or "Time to
// Hire" metric: the pipeline's furthest real stage is "offer", there's no
// joined/hired event recorded anywhere, so a "hired" number would be
// invented. What's shown instead ("Offers extended" / "Avg days to first
// offer") is the honest equivalent of what the data actually supports.
export async function GET() {
  let orgId: string | null;
  try {
    ({ orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) {
    return NextResponse.json({
      counts: { totalRequisitions: 0, totalCandidates: 0, openPositions: 0, offersThisMonth: 0, avgDaysToFirstOffer: null },
      departmentBreakdown: [],
      recentActivity: [],
    });
  }
  const admin = createAdminClient();

  const { data: reqs } = await admin
    .from("talent_requisitions")
    .select("id, title, department, status, headcount, created_at")
    .eq("org_id", orgId);
  const requisitions = reqs || [];
  const reqIds = requisitions.map((r) => r.id);

  const { data: cands } = reqIds.length
    ? await admin.from("talent_candidates").select("id, stage, updated_at, requisition_id").in("requisition_id", reqIds)
    : { data: [] as { id: string; stage: string; updated_at: string; requisition_id: string }[] };
  const candidates = cands || [];

  const totalRequisitions = requisitions.length;
  const totalCandidates = candidates.length;
  const openPositions = requisitions.filter((r) => ["approved", "published"].includes(r.status)).length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const offersThisMonth = candidates.filter((c) => c.stage === "offer" && new Date(c.updated_at) >= monthStart).length;

  // Avg days from requisition creation to that requisition's first candidate
  // reaching "offer" -- only over requisitions that have actually reached
  // offer, so this isn't diluted by ones still early in the pipeline.
  const reqById = new Map(requisitions.map((r) => [r.id, r]));
  const firstOfferByReq = new Map<string, string>();
  for (const c of candidates) {
    if (c.stage !== "offer") continue;
    const existing = firstOfferByReq.get(c.requisition_id);
    if (!existing || new Date(c.updated_at) < new Date(existing)) firstOfferByReq.set(c.requisition_id, c.updated_at);
  }
  let totalDays = 0;
  let offerReqCount = 0;
  for (const [reqId, offerDate] of firstOfferByReq) {
    const req_ = reqById.get(reqId);
    if (!req_) continue;
    totalDays += Math.max(0, (new Date(offerDate).getTime() - new Date(req_.created_at).getTime()) / 86_400_000);
    offerReqCount += 1;
  }
  const avgDaysToFirstOffer = offerReqCount > 0 ? Math.round(totalDays / offerReqCount) : null;

  const deptCounts = new Map<string, number>();
  for (const r of requisitions) {
    const key = r.department || "Unassigned";
    deptCounts.set(key, (deptCounts.get(key) || 0) + 1);
  }
  const departmentBreakdown = Array.from(deptCounts.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  const { data: history } = await admin
    .from("talent_requisition_status_history")
    .select("id, requisition_id, from_status, to_status, changed_at, changed_by, note")
    .in("requisition_id", reqIds.length ? reqIds : ["00000000-0000-0000-0000-000000000000"])
    .order("changed_at", { ascending: false })
    .limit(10);
  const changedByIds = Array.from(new Set((history || []).map((h) => h.changed_by).filter(Boolean)));
  const { data: actors } = changedByIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", changedByIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const actorById = new Map((actors || []).map((a) => [a.id, a.full_name || a.email || "Someone"]));
  const recentActivity = (history || []).map((h) => ({
    id: h.id,
    title: reqById.get(h.requisition_id)?.title || "A requisition",
    fromStatus: h.from_status,
    toStatus: h.to_status,
    actor: h.changed_by ? actorById.get(h.changed_by) || "Someone" : "System",
    changedAt: h.changed_at,
  }));

  return NextResponse.json({
    counts: { totalRequisitions, totalCandidates, openPositions, offersThisMonth, avgDaysToFirstOffer },
    departmentBreakdown,
    recentActivity,
  });
}
