import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasTalentRole } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";

// Org-wide recruiting overview for TA Head (or admin) -- unlike the
// recruiter snapshot, this deliberately IS org-wide: "sees all
// recruitment data" is the real, already-coded TA Head data-access rule
// (see requisitions/route.ts's confidential-visibility bypass and
// action-queue's assignment section).
export async function GET() {
  let user, orgId;
  try {
    ({ user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("is_admin, org_role").eq("id", user.id).maybeSingle();
  const isAdmin = !!profile?.is_admin || profile?.org_role === "org_admin";
  const isTaHead = isAdmin || (await hasTalentRole(admin, user.id, "ta_head"));
  if (!isTaHead) {
    return NextResponse.json({ error: "TA Head access required." }, { status: 403 });
  }

  const { data: reqs } = await admin
    .from("talent_requisitions")
    .select("id, title, department, status, created_at, created_by")
    .eq("org_id", orgId);
  const requisitions = reqs || [];
  const reqIds = requisitions.map((r) => r.id);

  const { data: cands } = reqIds.length
    ? await admin.from("talent_candidates").select("id, stage, updated_at, requisition_id").in("requisition_id", reqIds)
    : { data: [] as { id: string; stage: string; updated_at: string; requisition_id: string }[] };
  const candidates = cands || [];

  const openRequisitions = requisitions.filter((r) => ["approved", "published"].includes(r.status)).length;
  const activeCandidates = candidates.filter((c) => c.stage !== "rejected").length;

  const reqById = new Map(requisitions.map((r) => [r.id, r]));
  const firstOfferByReq = new Map<string, string>();
  for (const c of candidates) {
    if (c.stage !== "offer") continue;
    const existing = firstOfferByReq.get(c.requisition_id);
    if (!existing || new Date(c.updated_at) < new Date(existing)) firstOfferByReq.set(c.requisition_id, c.updated_at);
  }

  let totalDays = 0;
  let offerReqCount = 0;
  const monthBuckets = new Map<string, { totalDays: number; count: number }>();
  for (const [reqId, offerDate] of firstOfferByReq) {
    const req_ = reqById.get(reqId);
    if (!req_) continue;
    const days = Math.max(0, (new Date(offerDate).getTime() - new Date(req_.created_at).getTime()) / 86_400_000);
    totalDays += days;
    offerReqCount += 1;
    const monthKey = new Date(offerDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const bucket = monthBuckets.get(monthKey) || { totalDays: 0, count: 0 };
    bucket.totalDays += days;
    bucket.count += 1;
    monthBuckets.set(monthKey, bucket);
  }
  const avgDaysToFirstOffer = offerReqCount > 0 ? Math.round(totalDays / offerReqCount) : null;

  // Last 6 calendar months, oldest first, including empty ones -- a real
  // trend needs to show gaps, not just the months that happened to have data.
  const timeToHireTrend: { month: string; avgDays: number | null; offers: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const bucket = monthBuckets.get(key);
    timeToHireTrend.push({ month: key, avgDays: bucket ? Math.round(bucket.totalDays / bucket.count) : null, offers: bucket?.count || 0 });
  }

  const deptCounts = new Map<string, number>();
  for (const r of requisitions) {
    const key = r.department || "Unassigned";
    deptCounts.set(key, (deptCounts.get(key) || 0) + 1);
  }
  const departmentBreakdown = Array.from(deptCounts.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  // "Top hiring managers" here means who's actually requesting the most
  // roles (requisitions.created_by) -- there's no separate "hiring
  // manager approved N hires" event to count instead, so this is the
  // honest equivalent: who's driving the most requisition volume.
  const requesterCounts = new Map<string, number>();
  for (const r of requisitions) {
    if (!r.created_by) continue;
    requesterCounts.set(r.created_by, (requesterCounts.get(r.created_by) || 0) + 1);
  }
  const requesterIds = Array.from(requesterCounts.keys());
  const { data: requesterProfiles } = requesterIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", requesterIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const requesterNameById = new Map((requesterProfiles || []).map((p) => [p.id, p.full_name || p.email || "Someone"]));
  const topRequesters = Array.from(requesterCounts.entries())
    .map(([id, count]) => ({ name: requesterNameById.get(id) || "Someone", requisitions: count }))
    .sort((a, b) => b.requisitions - a.requisitions)
    .slice(0, 5);

  return NextResponse.json({
    counts: { openRequisitions, activeCandidates, avgDaysToFirstOffer },
    departmentBreakdown,
    timeToHireTrend,
    topRequesters,
  });
}
