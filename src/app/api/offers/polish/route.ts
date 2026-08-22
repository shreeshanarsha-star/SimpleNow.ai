import { callTextModel } from "@/lib/aiClient";
import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

export const maxDuration = 30;
const REQUEST_TIMEOUT_MS = 25_000;
const FEATURE_KEY = "Offer.ai";

type Component = { label: string; annual: number };

export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on the server. AI polish is unavailable until it's configured." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const candidateName = typeof body?.candidateName === "string" ? body.candidateName.trim() : "";
  const roleTitle = typeof body?.roleTitle === "string" ? body.roleTitle.trim() : "";
  const proposedCtcAnnual = typeof body?.proposedCtcAnnual === "number" ? body.proposedCtcAnnual : null;
  const currency = typeof body?.currency === "string" ? body.currency.trim() : "INR";
  const components = Array.isArray(body?.components) ? (body.components as Component[]) : [];
  const noticePeriod = typeof body?.noticePeriod === "string" ? body.noticePeriod.trim() : "";
  const joiningDate = typeof body?.joiningDate === "string" ? body.joiningDate.trim() : "";
  const draftNotes = typeof body?.draftNotes === "string" ? body.draftNotes.trim() : "";

  if (!candidateName || !roleTitle) {
    return NextResponse.json({ error: "Candidate name and role are required." }, { status: 400 });
  }

  const componentLines = components
    .map((c) => `- ${c.label}: ${currency} ${c.annual}/year`)
    .join("\n");

  const prompt = [
    "You write a formal compensation offer letter for a recruiter to send to a candidate.",
    "Keep every factual detail given exactly as stated -- do not invent components, dates, or figures that weren't provided.",
    "Return plain text only: a formal salutation, an opening paragraph confirming the role and offer, a compensation breakdown section, notice period / joining date if given, and a closing paragraph. No markdown headers, no extra commentary.",
    "",
    `Candidate: ${candidateName}`,
    `Role: ${roleTitle}`,
    proposedCtcAnnual ? `Total proposed CTC: ${currency} ${proposedCtcAnnual}/year` : "",
    componentLines ? `Compensation breakdown:\n${componentLines}` : "",
    noticePeriod ? `Notice period: ${noticePeriod}` : "",
    joiningDate ? `Proposed joining date: ${joiningDate}` : "",
    draftNotes ? `Recruiter's notes to incorporate: ${draftNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await callTextModel(prompt, 1200, REQUEST_TIMEOUT_MS);
    return NextResponse.json({ polished: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `AI polish failed: ${message}` }, { status: 502 });
  }
}
