import { createAdminClient } from "@/lib/supabase/admin";
import { draftJobDescription, checkBiasAndClarity } from "./ai";
import { sendApprovalRequestEmail } from "./mailer";
import type { JdStudioRequest } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

// Runs once a request has real answers in hand (either the recipient
// submitted the intake form, or a dropped sample JD was used to pre-fill
// them): drafts the JD, runs the bias/clarity check, and routes to the
// right approval step. Shared by the public intake-submit route and the
// authenticated "draft now" route (sample_jd / manual-mode path).
export async function runDraftPipeline(request: JdStudioRequest, ownerEmail: string | null) {
  const admin = createAdminClient();
  await admin.from("jdstudio_requests").update({ status: "drafting" }).eq("id", request.id);

  try {
    const answers = request.answers || {};
    const draft = await draftJobDescription(answers);
    const biasFlags = await checkBiasAndClarity(draft).catch(() => []);

    const jobTitle = answers.role_title || answers.job_title || request.job_title || null;

    await admin
      .from("jdstudio_requests")
      .update({
        status: "pending_approval",
        ai_draft_json: draft,
        bias_flags: biasFlags,
        job_title: jobTitle,
      })
      .eq("id", request.id);

    if (request.approver_mode === "route" && request.approver_email) {
      await sendApprovalRequestEmail({
        to: request.approver_email,
        jobTitle,
        department: request.department,
        requestId: request.id,
      }).catch(() => null);
    }
    // approver_mode "self" needs no email -- it shows up on the owner's
    // own dashboard under "Pending approval".
    return { ok: true as const };
  } catch (err) {
    await admin
      .from("jdstudio_requests")
      .update({ status: "failed", error: err instanceof Error ? err.message : "Drafting failed." })
      .eq("id", request.id);
    return { ok: false as const, error: err instanceof Error ? err.message : "Drafting failed." };
  }
}

export async function generateAndStoreFinalDocx(admin: AdminClient, request: JdStudioRequest) {
  const { generateJdDocx } = await import("./docgen");
  const draft = request.ai_draft_json;
  if (!draft) throw new Error("No AI draft to finalize.");

  const buffer = await generateJdDocx(
    { jobTitle: request.job_title || "Job Description", department: request.department, draft },
    request.template
  );

  const safeDept = (request.department || "General").replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${request.owner_id}/final/${safeDept}/${request.id}.docx`;

  const { error: uploadError } = await admin.storage.from("jdstudio").upload(path, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  return path;
}
