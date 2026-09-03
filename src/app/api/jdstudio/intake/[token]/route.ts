import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDraftPipeline, generateAndStoreFinalDocx } from "@/lib/jdstudio/pipeline";
import type { JdStudioRequest } from "@/lib/jdstudio/types";

// Public, unauthenticated endpoint -- gated purely by knowledge of the
// unguessable per-request token, same shape as contracts' sign/[token]
// route. Serves three states off one token: the intake form (sent/opened),
// a "processing" holding state (responded/drafting), and -- when this
// request was routed to another approver -- the approval screen
// (pending_approval), plus the final approved/published view.
export const maxDuration = 30;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_jdstudio_request_by_token", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  }

  if (row.status === "sent") {
    await supabase.rpc("mark_jdstudio_request_opened", { p_token: token });
    row.status = "opened";
  }

  return NextResponse.json({ request: row });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (body.action === "submit_answers") {
    const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const { data: ok } = await supabase.rpc("submit_jdstudio_answers", { p_token: token, p_answers: answers });
    if (!ok) {
      return NextResponse.json({ error: "This link has expired or already been used." }, { status: 400 });
    }
    const { data: reqRow } = await admin.from("jdstudio_requests").select("*").eq("token", token).single();
    if (reqRow) {
      const ownerEmail = (await admin.auth.admin.getUserById(reqRow.owner_id)).data.user?.email || null;
      await runDraftPipeline(reqRow as JdStudioRequest, ownerEmail);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve" || body.action === "request_changes") {
    const approve = body.action === "approve";
    const { data: ok } = await supabase.rpc("decide_jdstudio_request_by_token", { p_token: token, p_approve: approve });
    if (!ok) {
      return NextResponse.json({ error: "This request can't be acted on right now." }, { status: 400 });
    }
    if (approve) {
      const { data: reqRow } = await admin.from("jdstudio_requests").select("*").eq("token", token).single();
      if (reqRow) {
        try {
          const docxPath = await generateAndStoreFinalDocx(admin, reqRow as JdStudioRequest);
          await admin.from("jdstudio_requests").update({ final_docx_path: docxPath }).eq("id", reqRow.id);
        } catch {
          // Status is already "approved"; the owner can regenerate the
          // document from the dashboard if this best-effort step failed.
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
