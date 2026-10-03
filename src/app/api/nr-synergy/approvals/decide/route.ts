import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { decide, NrsApprovalError, type NrsDecision } from "@/lib/nrs/approvals";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, readJson, str } from "../../time/_lib/server";
import { applyCorrection } from "../_lib/applyCorrection";

const DECISIONS: readonly NrsDecision[] = ["approve", "reject", "send_back"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/nr-synergy/approvals/decide
// body: { stepId, decision: 'approve'|'reject'|'send_back', comment? }
// Permission is checked inside decide() via the nrs_can_act_on_step RPC.
export async function POST(req: Request) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs();
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase } = g;

  const body = await readJson(req);
  if (!body) return jsonError("Invalid request body.", 400);
  const stepId = str(body.stepId, 64);
  if (!stepId || !UUID_RE.test(stepId)) return jsonError("Unknown approval step.", 400);
  const decision = body.decision;
  if (typeof decision !== "string" || !DECISIONS.includes(decision as NrsDecision)) {
    return jsonError("Choose approve, reject or send back.", 400);
  }
  const comment = str(body.comment, 2000);
  if (decision !== "approve" && !comment) return jsonError("A comment is required to reject or send back.", 400);

  const admin = createAdminClient();
  try {
    const result = await decide(stepId, decision as NrsDecision, comment, { supabase, ctx, admin });
    if (result.requestStatus === "approved") {
      const { data } = await admin.from("nrs_requests").select("kind, subject_id").eq("id", result.requestId).maybeSingle();
      const reqRow = data as { kind: string; subject_id: string } | null;
      if (reqRow?.kind === "correction") {
        const applied = await applyCorrection(admin, reqRow.subject_id);
        if (applied.error) console.error("[nrs] apply correction failed", reqRow.subject_id, applied.error);
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NrsApprovalError) return jsonError(e.message, e.status);
    console.error("[nrs] decide failed", e);
    return jsonError("Could not save the decision.", 500);
  }
}
