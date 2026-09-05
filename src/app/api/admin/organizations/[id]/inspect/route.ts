import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminActivity } from "@/lib/adminActivityLog";

// Read-only support view of one org's data across every tool -- explicitly
// NOT "log in as this user". No session is created, no credits or usage
// caps are touched, and every call here is written to admin_activity_log
// so there's a permanent record of when and why the owner looked.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }
  const { id: orgId } = await params;
  const admin = createAdminClient();

  const { data: org, error } = await admin.from("organizations").select("*").eq("id", orgId).single();
  if (error || !org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const { data: members } = await admin
    .from("profiles")
    .select("id, email, full_name, org_role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  const memberIds = (members || []).map((m) => m.id);

  const [
    { count: talentReqCount },
    { data: talentReqIds },
    { count: jdRequestCount },
    { count: offerCount },
    { count: screenBatchCount },
    { count: sourceSearchCount },
    { count: assessmentCount },
    { data: recentActivity },
  ] = await Promise.all([
    admin.from("talent_requisitions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("talent_requisitions").select("id").eq("org_id", orgId),
    memberIds.length
      ? admin.from("jdstudio_requests").select("id", { count: "exact", head: true }).in("owner_id", memberIds)
      : Promise.resolve({ count: 0 }),
    admin.from("offers").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("smart_screen_batches").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("smart_source_searches").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("assessment_assignments").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin
      .from("admin_activity_log")
      .select("id, action, actor_email, target_label, created_at")
      .eq("target_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  let talentCandidateCount = 0;
  const reqIds = (talentReqIds || []).map((r) => r.id);
  if (reqIds.length) {
    const { count } = await admin
      .from("talent_candidates")
      .select("id", { count: "exact", head: true })
      .in("requisition_id", reqIds);
    talentCandidateCount = count || 0;
  }

  await logAdminActivity(admin, {
    actorId: user.id,
    actorEmail: user.email,
    action: "inspect_org",
    targetType: "organization",
    targetId: orgId,
    targetLabel: org.name,
  });

  return NextResponse.json({
    org,
    members: members || [],
    usage: {
      "Talent.ai": { requisitions: talentReqCount || 0, candidates: talentCandidateCount },
      "JD Studio.ai": { requests: jdRequestCount || 0 },
      "Offer.ai": { offers: offerCount || 0 },
      "Smart Screen.ai": { batches: screenBatchCount || 0 },
      "Smart Source.ai": { searches: sourceSearchCount || 0 },
      "Assessment.ai": { assignments: assessmentCount || 0 },
    },
    recentActivity: recentActivity || [],
  });
}
