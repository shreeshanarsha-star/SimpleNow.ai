import { askGauriAI } from "@/lib/gauriAI";

// Cattle-health triage — turns a farmer's raw description (voice-transcribed
// or typed) into a structured draft a vet can review fast: likely causes,
// immediate home care that's safe regardless of diagnosis, a general
// treatment direction, and an urgency flag. This is explicitly a DRAFT for
// a vet to approve, edit, or reject — it must never reach the farmer
// without a human vet signing off first.
//
// Ported verbatim (prompt text unchanged) from askshree-app (v1)'s
// lib/gauriVet.js.
const TRIAGE_PROMPT = `You are a veterinary triage assistant helping a vet quickly assess a cattle
health case reported by a farmer. You are NOT giving advice directly to the farmer — a qualified vet
will review, edit, and approve everything you write before the farmer ever sees it. Because of that,
be direct and clinical, not reassuring or hedged — the vet needs your honest read, not a soft summary.

Given the farmer's description (and any cow details provided), produce:
- likely_causes: array of 2-4 short possible causes/conditions, most likely first
- immediate_care: 1-3 short, safe general care steps that make sense regardless of exact diagnosis
  (e.g. isolate the animal, ensure water access) — nothing that could be harmful if the diagnosis
  turns out to be wrong
- suggested_direction: 1-2 sentences on the general treatment direction a vet might consider
  (no specific product/drug names — no catalog is connected yet, that's for the vet to specify)
- urgency: "routine", "prompt", or "emergency" — emergency means this reads like it could be
  life-threatening (e.g. bloat, difficulty breathing, unable to stand) and needs immediate attention
- urgency_reason: one short sentence explaining the urgency call

Respond as JSON only, no markdown: { "likely_causes": [...], "immediate_care": [...],
"suggested_direction": string, "urgency": string, "urgency_reason": string }`;

export interface TriageDraft {
  likely_causes: string[];
  immediate_care: string[];
  suggested_direction: string;
  urgency: string;
  urgency_reason: string;
}

export async function draftTriage({
  issueText,
  cowDetails,
}: {
  issueText: string;
  cowDetails?: string | null;
}): Promise<TriageDraft> {
  const context = `Cow details: ${cowDetails || "not provided"}

Farmer's description of the issue:
${issueText}`;

  const raw = await askGauriAI(TRIAGE_PROMPT, context, 800);
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

export function formatDraftForVet(draft: TriageDraft): string {
  const lines: string[] = [];
  lines.push(`Urgency: ${draft.urgency?.toUpperCase() || "UNKNOWN"} — ${draft.urgency_reason || ""}`);
  lines.push("");
  lines.push("Likely causes:");
  (draft.likely_causes || []).forEach((c) => lines.push(`- ${c}`));
  lines.push("");
  lines.push("Immediate care:");
  (draft.immediate_care || []).forEach((c) => lines.push(`- ${c}`));
  lines.push("");
  lines.push("Suggested direction:");
  lines.push(draft.suggested_direction || "");
  return lines.join("\n");
}
