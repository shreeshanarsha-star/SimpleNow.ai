import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/gauriAuth";
import { draftTriage } from "@/lib/gauriVet";

export const dynamic = "force-dynamic";

// POST is public — farmers never get an account, so there's no auth check
// here on purpose. GET is for the vet queue only.
//
// Two ways a case gets created:
// 1. The avatar conversation flow (conversationTranscript present) — the
//    farmer already talked it through with Gauri and explicitly confirmed
//    "yes, have a vet call me", so we already have a confident summary and
//    just need to record it, flagged needs_callback so it stands out in the
//    vet queue as "call this farmer", not just "review when free".
// 2. The plain-text fallback (no conversationTranscript) — a single
//    description run through draftTriage() in one shot, same as before.
//
// Ported verbatim from askshree-app (v1)'s app/api/gauri/cases/route.js.
export async function POST(req: Request) {
  const body = await req.json();
  const {
    farmerName,
    farmerPhone,
    farmerAddress,
    cowDetails,
    issueText,
    conversationTranscript,
    surfaceDiagnosis,
    suggestedProductId,
    urgency,
  } = body;

  const db = createAdminClient();

  if (Array.isArray(conversationTranscript) && conversationTranscript.length > 0) {
    const farmerLines = conversationTranscript
      .filter((t: { role: string }) => t.role === "farmer")
      .map((t: { text: string }) => t.text)
      .join(" ");
    if (!farmerLines || farmerLines.trim().length < 5) {
      return NextResponse.json({ ok: false, error: "Describe the issue first." }, { status: 400 });
    }
    if (!farmerPhone || farmerPhone.trim().length < 6) {
      return NextResponse.json({ ok: false, error: "A phone number is needed so the vet can call." }, { status: 400 });
    }

    const aiDraft = {
      likely_causes: surfaceDiagnosis ? [surfaceDiagnosis] : [],
      immediate_care: [],
      suggested_direction: surfaceDiagnosis || "",
      urgency: urgency || "routine",
      urgency_reason: "Derived from the farmer's conversation with the Gauri avatar.",
    };

    const { data: caseRow, error: insertError } = await db
      .from("gauri_cases")
      .insert({
        farmer_name: farmerName || null,
        farmer_phone: farmerPhone.trim(),
        farmer_address: farmerAddress || null,
        cow_details: cowDetails || null,
        issue_text: farmerLines.trim(),
        conversation_transcript: conversationTranscript,
        surface_diagnosis: surfaceDiagnosis || null,
        suggested_product_id: suggestedProductId || null,
        ai_draft: JSON.stringify(aiDraft),
        needs_callback: true,
        status: "pending_vet_review",
      })
      .select("id")
      .single();
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not submit that. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, caseId: caseRow.id });
  }

  // Fallback: plain-text single-shot path
  if (!issueText || issueText.trim().length < 5) {
    return NextResponse.json({ ok: false, error: "Describe the issue first." }, { status: 400 });
  }

  const { data: caseRow, error: insertError } = await db
    .from("gauri_cases")
    .insert({
      farmer_name: farmerName || null,
      farmer_phone: farmerPhone || null,
      farmer_address: farmerAddress || null,
      cow_details: cowDetails || null,
      issue_text: issueText.trim(),
      status: "pending_ai",
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ ok: false, error: "Could not submit that. Try again." }, { status: 500 });
  }

  try {
    const draft = await draftTriage({ issueText, cowDetails });
    await db
      .from("gauri_cases")
      .update({
        ai_draft: JSON.stringify(draft),
        status: "pending_vet_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseRow.id);
  } catch {
    // AI drafting failed — leave status as pending_ai so a vet can still
    // see the raw case and write a recommendation from scratch.
  }

  return NextResponse.json({ ok: true, caseId: caseRow.id });
}

export async function GET(req: Request) {
  const account = await getSessionAccount(req);
  if (!account || (account.role !== "vet" && account.role !== "admin")) {
    return NextResponse.json({ error: "Vet login required." }, { status: 401 });
  }
  const db = createAdminClient();
  const { data } = await db.from("gauri_cases").select("*").order("created_at", { ascending: false }).limit(100);
  return NextResponse.json({ cases: data || [] });
}
