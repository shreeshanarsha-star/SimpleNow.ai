import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { draftJobDescription, checkBiasAndClarity, draftAnswersFromSampleJd } from "@/lib/jdstudio/ai";
import { generateAndStoreFinalDocx } from "@/lib/jdstudio/pipeline";
import { checkGuestGate, consumeGuestOrCredit, guestGateErrorResponse, type GuestGateResult } from "@/lib/guestAccess";
import { isGuestTrialEnabled, isToolPaused } from "@/lib/platformSettings";
import type { JdStudioRequest, JdTemplate } from "@/lib/jdstudio/types";

export const maxDuration = 60;
const TOOL_KEY = "JD Studio.ai";

export async function POST(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  if (await isToolPaused(supabase, TOOL_KEY)) {
    return NextResponse.json(
      { error: "JD Studio.ai is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from("profiles")
    .select("org_id, is_admin, is_anonymous, credits, guest_tool_usage, created_at")
    .eq("id", user.id)
    .single();

  let gate: GuestGateResult | null = null;
  if (profileRow) {
    const guestTrialEnabled = await isGuestTrialEnabled(admin);
    gate = checkGuestGate(
      {
        org_id: profileRow.org_id,
        is_admin: !!profileRow.is_admin,
        is_anonymous: profileRow.is_anonymous,
        credits: profileRow.credits,
        guest_tool_usage: profileRow.guest_tool_usage as Record<string, number> | null,
        created_at: profileRow.created_at,
      },
      TOOL_KEY,
      guestTrialEnabled
    );
    if (!gate.allowed) return guestGateErrorResponse(gate);
  }

  const body = await request.json().catch(() => ({}));
  const rawText: string = typeof body.raw_text === "string" ? body.raw_text.trim() : "";
  let answers: Record<string, string> = typeof body.answers === "object" && body.answers ? body.answers : {};
  const department: string = typeof body.department === "string" && body.department ? body.department : "General";
  const template: JdTemplate = ["internal", "external", "both"].includes(body.template) ? body.template : "both";

  // If raw text / sample JD was passed and no structured answers, extract them first
  if (rawText && (!answers.role_title && !answers.kras && !answers.kra_1)) {
    try {
      const extracted = await draftAnswersFromSampleJd(rawText);
      answers = {
        role_title: extracted.job_title || "",
        department: extracted.department || department,
        band_grade: extracted.band_grade || "",
        location: extracted.location || "",
        experience_level: extracted.experience_level || "",
        comp_range: extracted.comp_range || "",
        kra_1: extracted.kras?.[0] || "",
        kra_2: extracted.kras?.[1] || "",
        kra_3: extracted.kras?.[2] || "",
        kra_4: extracted.kras?.[3] || "",
        kra_5: extracted.kras?.[4] || "",
        must_have_1: extracted.must_have?.[0] || "",
        must_have_2: extracted.must_have?.[1] || "",
        must_have_3: extracted.must_have?.[2] || "",
        additional_strengths: Array.isArray(extracted.additional_strengths) ? extracted.additional_strengths.join(", ") : "",
      };
    } catch {
      answers = { role_title: "Role Specification", department, notes: rawText };
    }
  }

  try {
    const draft = await draftJobDescription(answers);
    const biasFlags = await checkBiasAndClarity(draft).catch(() => []);
    const jobTitle = draft.internal?.role_title || draft.external?.role_title || answers.role_title || "Job Description";
    const dept = draft.internal?.department || answers.department || department;

    // Create a request record so it can be tracked, downloaded, and published
    const { data: req, error: insertError } = await admin
      .from("jdstudio_requests")
      .insert({
        owner_id: user.id,
        upload_id: null,
        mode: "manual",
        status: "approved", // In direct mode, it is immediately approved/ready
        recipient_name: user.email?.split("@")[0] || "User",
        recipient_email: user.email || "self@simplenow.ai",
        department: dept,
        job_title: jobTitle,
        answers,
        responded_at: new Date().toISOString(),
        ai_draft_json: draft,
        bias_flags: biasFlags,
        approver_mode: "self",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        template,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Generate final docx files in the background
    await generateAndStoreFinalDocx(admin, req as JdStudioRequest).catch((err) => {
      console.error("Docx generation warning:", err);
    });

    if (gate) await consumeGuestOrCredit(admin, user.id, gate, TOOL_KEY);

    return NextResponse.json({ request: req, draft, bias_flags: biasFlags });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate job descriptions." },
      { status: 500 }
    );
  }
}
