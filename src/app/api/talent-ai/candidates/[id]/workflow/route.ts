import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasTalentRole, logAudit, notifyUser } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";

async function canActOnCandidate(admin: ReturnType<typeof createAdminClient>, userId: string, requisitionId: string) {
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userId).single();
  if (profile?.is_admin) return true;
  const { data: req } = await admin.from("talent_requisitions").select("created_by").eq("id", requisitionId).single();
  if (req?.created_by === userId) return true;
  const { data: assignment } = await admin
    .from("talent_requisition_assignment")
    .select("recruiter_id")
    .eq("requisition_id", requisitionId)
    .maybeSingle();
  return assignment?.recruiter_id === userId;
}

// Cross-role candidate actions: HM shortlist/reject (applies immediately,
// not just a recommendation), dedup linking, compensation capture, the
// two-signature Selection gate, and the Move to Offer handoff into Offer.ai.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user, orgId;
  try {
    ({ user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : null;
  const admin = createAdminClient();

  const { data: candidate } = await admin.from("talent_candidates").select("*, talent_requisitions(id, title, org_id)").eq("id", id).single();
  if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const requisitionId = candidate.requisition_id as string;
  const requisitionRow = candidate.talent_requisitions as { title: string; org_id: string } | null;
  const requisitionTitle = requisitionRow?.title || "the role";
  // admin client bypasses RLS -- verify this candidate's requisition
  // belongs to the caller's own organization before allowing any action.
  const isPlatformOwner = (await admin.from("profiles").select("is_admin").eq("id", user.id).single()).data?.is_admin;
  if (!isPlatformOwner && requisitionRow?.org_id !== orgId) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  if (action === "set_stage") {
    const stage = typeof body?.stage === "string" ? body.stage : null;
    if (!stage) return NextResponse.json({ error: "stage is required." }, { status: 400 });
    const allowed = await canActOnCandidate(admin, user.id, requisitionId);
    if (!allowed) return NextResponse.json({ error: "Not authorized for this candidate." }, { status: 403 });

    await admin.from("talent_candidates").update({ stage, updated_at: new Date().toISOString() }).eq("id", id);
    await admin.from("talent_stage_history").insert({
      candidate_id: id,
      from_stage: candidate.stage,
      to_stage: stage,
      changed_by: user.id,
      note: typeof body?.note === "string" ? body.note : null,
    });
    await logAudit({ entityType: "talent_candidates", entityId: id, actorId: user.id, action: "stage_changed", detail: { from: candidate.stage, to: stage } });
    return NextResponse.json({ ok: true });
  }

  if (action === "link_duplicate") {
    const duplicateOfId = typeof body?.duplicateOfId === "string" ? body.duplicateOfId : null;
    if (!duplicateOfId) return NextResponse.json({ error: "duplicateOfId is required." }, { status: 400 });
    const { error } = await admin.from("talent_candidates").update({ duplicate_of: duplicateOfId }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({ entityType: "talent_candidates", entityId: id, actorId: user.id, action: "linked_duplicate", detail: { duplicateOfId } });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_comp") {
    const allowed = await canActOnCandidate(admin, user.id, requisitionId);
    if (!allowed) return NextResponse.json({ error: "Not authorized for this candidate." }, { status: 403 });
    const patch: Record<string, unknown> = {};
    for (const key of ["current_ctc", "expected_ctc", "proposed_ctc"] as const) {
      const camelKey = key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
      if (camelKey in (body || {})) {
        const v = body[camelKey];
        patch[key] = v === "" || v == null ? null : Number(v);
      }
    }
    if ("compCurrency" in (body || {})) patch.comp_currency = body.compCurrency || "INR";
    const { error } = await admin.from("talent_candidates").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({ entityType: "talent_candidates", entityId: id, actorId: user.id, action: "comp_updated", detail: patch });
    return NextResponse.json({ ok: true });
  }

  if (action === "select_signoff") {
    const { data: req_ } = await admin.from("talent_requisitions").select("created_by").eq("id", requisitionId).single();
    const isHm = req_?.created_by === user.id;
    const { data: assignment } = await admin.from("talent_requisition_assignment").select("recruiter_id").eq("requisition_id", requisitionId).maybeSingle();
    const isRecruiter = assignment?.recruiter_id === user.id;
    const isTaHead = await hasTalentRole(admin, user.id, "ta_head");
    const isAdmin = !!isPlatformOwner;

    if (!isHm && !isRecruiter && !isTaHead && !isAdmin) {
      return NextResponse.json({ error: "Not authorized to sign off on selection." }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    if (isHm && !candidate.selected_hm_by) {
      patch.selected_hm_by = user.id;
      patch.selected_hm_at = new Date().toISOString();
    } else if ((isRecruiter || isTaHead) && !candidate.selected_ta_by) {
      patch.selected_ta_by = user.id;
      patch.selected_ta_at = new Date().toISOString();
    } else if (isAdmin) {
      // Admin can stand in for whichever sign-off is still missing --
      // keeps the flow testable/unblockable without needing every role
      // populated with a real distinct user.
      if (!candidate.selected_hm_by) {
        patch.selected_hm_by = user.id;
        patch.selected_hm_at = new Date().toISOString();
      } else if (!candidate.selected_ta_by) {
        patch.selected_ta_by = user.id;
        patch.selected_ta_at = new Date().toISOString();
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to sign off, or you already signed off." }, { status: 400 });
    }
    const { data: updated, error } = await admin.from("talent_candidates").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const bothSigned = !!updated.selected_hm_by && !!updated.selected_ta_by;
    if (bothSigned && candidate.stage !== "selected") {
      await admin.from("talent_candidates").update({ stage: "selected" }).eq("id", id);
      await admin.from("talent_stage_history").insert({
        candidate_id: id,
        from_stage: candidate.stage,
        to_stage: "selected",
        changed_by: user.id,
        note: "Both sign-offs complete",
      });
      const { data: assignment2 } = await admin.from("talent_requisition_assignment").select("recruiter_id").eq("requisition_id", requisitionId).maybeSingle();
      if (assignment2?.recruiter_id) {
        await notifyUser({ userId: assignment2.recruiter_id, title: `${candidate.name} is Selected for "${requisitionTitle}"`, body: "Both sign-offs are complete -- ready for compensation + Move to Offer.", link: `/tools/talent-ai?requisition=${requisitionId}` });
      }
    }
    await logAudit({ entityType: "talent_candidates", entityId: id, actorId: user.id, action: "selection_signoff" });
    return NextResponse.json({ ok: true, bothSigned });
  }

  if (action === "move_to_offer") {
    const allowed = await canActOnCandidate(admin, user.id, requisitionId);
    if (!allowed) return NextResponse.json({ error: "Not authorized for this candidate." }, { status: 403 });
    if (candidate.stage !== "selected") {
      return NextResponse.json({ error: "Candidate must be Selected (both sign-offs) before moving to Offer." }, { status: 409 });
    }
    if (candidate.current_ctc == null || candidate.expected_ctc == null || candidate.proposed_ctc == null) {
      return NextResponse.json({ error: "Current, expected, and proposed compensation are all required before moving to Offer." }, { status: 409 });
    }

    await admin
      .from("talent_candidates")
      .update({ stage: "offer", moved_to_offer_at: new Date().toISOString() })
      .eq("id", id);
    await admin.from("talent_stage_history").insert({
      candidate_id: id,
      from_stage: "selected",
      to_stage: "offer",
      changed_by: user.id,
      note: "Moved to Offer.ai",
    });
    await logAudit({ entityType: "talent_candidates", entityId: id, actorId: user.id, action: "moved_to_offer" });

    const offerUrl = `/tools/offer-ai?candidateName=${encodeURIComponent(candidate.name)}&candidateEmail=${encodeURIComponent(candidate.email || "")}&roleTitle=${encodeURIComponent(requisitionTitle)}&proposedCtc=${candidate.proposed_ctc}`;
    return NextResponse.json({ ok: true, offerUrl });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
