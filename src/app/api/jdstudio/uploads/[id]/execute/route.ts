import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { findDuplicateCandidate } from "@/lib/jdstudio/duplicate";
import { sendIntakeInviteEmail } from "@/lib/jdstudio/mailer";
import { runDraftPipeline } from "@/lib/jdstudio/pipeline";
import { checkGuestGate, consumeGuestOrCredit, guestGateErrorResponse, type GuestGateResult } from "@/lib/guestAccess";
import type { JdStudioRequest, JdTemplate, ApproverMode } from "@/lib/jdstudio/types";

export const maxDuration = 60;

const TOOL_KEY = "JD Studio.ai";

interface Target {
  name: string | null;
  email: string;
  department: string;
  job_title: string | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: upload } = await supabase.from("jdstudio_uploads").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!upload) return NextResponse.json({ error: "Upload not found." }, { status: 404 });

  const { data: profileRow } = await admin
    .from("profiles")
    .select("org_id, is_admin, is_anonymous, credits, guest_tool_usage, created_at")
    .eq("id", user.id)
    .single();

  // The bulk / email-list path sends real emails to real third parties
  // (stakeholders filling out an intake questionnaire) -- that stays
  // restricted to real organizations, same reasoning as excluding Job
  // Postings.ai and Contracts & eSign from the guest trial entirely.
  // Guests and signed-up-but-org-less individuals only get the
  // self-contained "draft from a sample JD" path below.
  if (upload.kind !== "sample_jd" && !profileRow?.org_id) {
    return NextResponse.json(
      { error: "Sending intake invites to other people requires an approved organization. Drop a sample JD instead to draft one yourself." },
      { status: 403 }
    );
  }

  let gate: GuestGateResult | null = null;
  if (upload.kind === "sample_jd" && profileRow) {
    gate = checkGuestGate(
      {
        org_id: profileRow.org_id,
        is_admin: !!profileRow.is_admin,
        is_anonymous: profileRow.is_anonymous,
        credits: profileRow.credits,
        guest_tool_usage: profileRow.guest_tool_usage as Record<string, number> | null,
        created_at: profileRow.created_at,
      },
      TOOL_KEY
    );
    if (!gate.allowed) return guestGateErrorResponse(gate);
  }

  const body = await request.json().catch(() => ({}));
  const questionSetId: string | null = typeof body.question_set_id === "string" ? body.question_set_id : null;
  const template: JdTemplate = ["standard", "compact", "branded"].includes(body.template) ? body.template : "standard";
  const approverMode: ApproverMode = body.approver_mode === "route" ? "route" : "self";
  const approverEmail: string | null = typeof body.approver_email === "string" ? body.approver_email : null;
  const defaultDepartment: string = typeof body.department === "string" && body.department ? body.department : "General";

  let questionsSnapshot = null;
  if (questionSetId) {
    const { data: qs } = await admin.from("jdstudio_question_sets").select("questions").eq("id", questionSetId).maybeSingle();
    questionsSnapshot = qs?.questions ?? null;
  }

  await admin.from("jdstudio_uploads").update({ status: "executing" }).eq("id", id);

  const created: JdStudioRequest[] = [];

  if (upload.kind === "sample_jd") {
    const answersRaw = body.answers || upload.classification?.sample_answers || {};
    const answers: Record<string, string> = {
      role_title: answersRaw.job_title || "",
      department: answersRaw.department || defaultDepartment,
      location_mode: answersRaw.location_mode || "",
      employment_headcount: answersRaw.employment_headcount || "",
      years_experience: answersRaw.years_experience || "",
      comp_range: answersRaw.comp_range || "",
      top_responsibilities: answersRaw.top_responsibilities || "",
      must_have_1: answersRaw.must_have?.[0] || "",
      must_have_2: answersRaw.must_have?.[1] || "",
      must_have_3: answersRaw.must_have?.[2] || "",
      must_have_4: answersRaw.must_have?.[3] || "",
      must_have_5: answersRaw.must_have?.[4] || "",
      good_to_have_1: answersRaw.good_to_have?.[0] || "",
      good_to_have_2: answersRaw.good_to_have?.[1] || "",
      good_to_have_3: answersRaw.good_to_have?.[2] || "",
      good_to_have_4: answersRaw.good_to_have?.[3] || "",
      good_to_have_5: answersRaw.good_to_have?.[4] || "",
    };
    const department = answersRaw.department || defaultDepartment;
    const jobTitle = answersRaw.job_title || null;
    const dup = await findDuplicateCandidate(admin, user.id, department, jobTitle || "").catch(() => null);

    const { data: req } = await admin
      .from("jdstudio_requests")
      .insert({
        owner_id: user.id,
        upload_id: upload.id,
        question_set_id: questionSetId,
        mode: upload.mode,
        status: upload.mode === "auto" ? "responded" : "pending_review",
        recipient_name: null,
        recipient_email: user.email || "self@simplenow.ai",
        department,
        job_title: jobTitle,
        questions_snapshot: questionsSnapshot,
        answers,
        responded_at: new Date().toISOString(),
        duplicate_of_id: dup?.id ?? null,
        duplicate_score: dup?.score ?? null,
        approver_mode: approverMode,
        approver_email: approverEmail,
        template,
      })
      .select()
      .single();
    if (req) {
      created.push(req);
      if (upload.mode === "auto") {
        await runDraftPipeline(req as JdStudioRequest, user.email || null);
      }
      // Only spend a guest action / credit once the request actually got
      // created -- a failed insert shouldn't cost the guest their try.
      if (gate) await consumeGuestOrCredit(admin, user.id, gate, TOOL_KEY);
    }
  } else {
    const targets: Target[] = Array.isArray(body.targets) ? body.targets : upload.extracted_rows || [];
    for (const t of targets) {
      if (!t.email) continue;
      const department = t.department || defaultDepartment;
      const dup = await findDuplicateCandidate(admin, user.id, department, t.job_title || "").catch(() => null);
      const { data: req } = await admin
        .from("jdstudio_requests")
        .insert({
          owner_id: user.id,
          upload_id: upload.id,
          question_set_id: questionSetId,
          mode: upload.mode,
          status: upload.mode === "auto" ? "sent" : "pending_review",
          recipient_name: t.name,
          recipient_email: t.email,
          department,
          job_title: t.job_title,
          questions_snapshot: questionsSnapshot,
          duplicate_of_id: dup?.id ?? null,
          duplicate_score: dup?.score ?? null,
          approver_mode: approverMode,
          approver_email: approverEmail,
          template,
        })
        .select()
        .single();
      if (req) {
        created.push(req);
        if (upload.mode === "auto") {
          await sendIntakeInviteEmail({
            to: req.recipient_email,
            recipientName: req.recipient_name,
            jobTitle: req.job_title,
            department: req.department,
            token: req.token,
          }).catch(() => null);
        }
      }
    }
  }

  await admin.from("jdstudio_uploads").update({ status: "completed" }).eq("id", id);

  return NextResponse.json({ requests: created });
}
