import { askGauriAI } from "@/lib/gauriAI";
import { createAdminClient } from "@/lib/supabase/admin";

// Multi-turn farmer-facing triage conversation for the Gauri.ai avatar. Unlike
// draftTriage() (a one-shot draft from a single description, used by the older
// text-only intake path), this holds a back-and-forth: Gauri asks clarifying
// questions until it's reasonably confident, then produces a plain-language
// "this could be X, Y product may help, shall I have a vet call you?" turn.
// Every word of this ever reaches the farmer directly -- there is no vet
// review gate on the conversation itself -- so the prompt is deliberately
// conservative: broad possibilities, safe generic care only, no drug dosing,
// and always frames the product as a vet-confirmed suggestion, not a
// prescription. The vet still reviews and can correct everything before any
// product actually ships.
//
// Ported verbatim (prompt text unchanged) from askshree-app (v1)'s
// lib/gauriConversation.js.

const MAX_TURNS_BEFORE_FORCED_SUMMARY = 6;

interface TranscriptTurn {
  role: "farmer" | "gauri";
  text: string;
}

interface GauriProduct {
  id: string;
  name: string;
  category: string;
  use_summary: string;
  species: string;
}

async function loadProductCatalog(): Promise<GauriProduct[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("gauri_products")
    .select("id, name, category, use_summary, species")
    .eq("active", true)
    .order("category");
  return data || [];
}

function formatCatalog(products: GauriProduct[]): string {
  return products
    .map((p) => `- ${p.name} (${p.category}, for ${p.species}): ${p.use_summary}`)
    .join("\n");
}

function formatTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .map((t) => `${t.role === "farmer" ? "Farmer" : "Gauri"}: ${t.text}`)
    .join("\n");
}

function buildSystemPrompt(turnCount: number, language: string): string {
  const mustWrapUp = turnCount >= MAX_TURNS_BEFORE_FORCED_SUMMARY;
  return `You are Gauri, a warm, plain-spoken voice assistant that talks directly to farmers about
a sick cow or buffalo. You are NOT a vet and must never sound like you're diagnosing with
certainty or prescribing a dose -- a real vet reviews every case before anything is acted on.
Speak simply, like a caring person, not a technical system. Keep every line short enough to be
spoken aloud naturally (1-3 sentences).

You will receive the conversation so far and a list of real products your platform's partner
stockist carries (with what each is generally used for). Your job each turn is ONE of two things:

1. ASK ONE CLARIFYING QUESTION -- if you don't yet have enough to form a reasonable, safe,
   surface-level read (e.g. you don't know how long it's been going on, whether she's still
   eating/drinking/standing, whether this is sudden or gradual, or any other detail that would
   meaningfully change what you'd say next). Ask only ONE question per turn, the single most
   useful one, in simple language. Do not interrogate -- 2-4 questions total is normal before
   you're ready to sum up; ${mustWrapUp ? "you have already asked enough -- wrap up now with your best read even if a little uncertain, and say plainly you're not fully sure." : "keep going only if truly necessary."}

2. SUM UP AND ASK PERMISSION -- once you have enough (or must wrap up), give: a plain-language
   surface-level read of what this could be (never state it as certain -- "this could be" /
   "this sounds like it might be"), name ONE product from the list below if one genuinely fits
   (skip this if nothing fits well or the issue doesn't call for a product), and then ask
   permission: "Shall I have a vet call you to confirm?" This must always end by asking that
   permission question, and nothing beyond this point should claim to be a diagnosis -- always
   attribute the actual confirmation to the vet who will call.

Never invent a product not on this list. Never state a drug dose. Never claim something is or
isn't an emergency in a way that could delay urgent care -- if anything sounds severe (down and
can't stand, heavy bleeding, struggling to breathe, a prolapse, sudden collapse), say plainly
that this sounds urgent and a vet should be contacted right away, and still offer the callback.

Available products (name, category, what for):
${"{{CATALOG}}"}

Conversation so far:
${"{{TRANSCRIPT}}"}

LANGUAGE: The farmer's likely language based on their location is "${language || "Hindi"}" -- use that
only as your starting guess for the very first turn (before the farmer has said anything). From the
farmer's actual message text onward, detect what language/script they are actually speaking or typing
in -- they may differ from the location guess, switch mid-conversation, or code-mix -- and reply in
THAT detected language, the way a native speaker would naturally speak (not a stiff literal
translation). If there is no farmer message yet, reply in "${language || "Hindi"}".

Respond as JSON only, no markdown fences: { "reply": string, "detectedLanguage": string, "ready": boolean,
"surfaceDiagnosis": string|null, "suggestedProduct": string|null, "urgency": "routine"|"prompt"|"emergency"|null }

Set "detectedLanguage" to exactly one of: "English", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi",
"Bengali", "Gujarati", "Punjabi", "Malayalam" -- whichever matches what the farmer is actually
speaking/typing right now (or your first-turn guess if no farmer message yet). If it's none of these,
pick the closest one rather than inventing a new value.

Keep "surfaceDiagnosis", "suggestedProduct" and "urgency" in English regardless, since a vet reads those.

"reply" is exactly what Gauri should say out loud next (the question, or the summary+permission-ask).
Set "ready": true only on the summary turn. "surfaceDiagnosis", "suggestedProduct" and "urgency"
should be null while "ready" is false, and filled in when "ready" is true. "suggestedProduct" must
exactly match a product name from the list above, or be null if none genuinely fits.`;
}

export async function continueConversation({
  transcript,
  cowDetails,
  language,
}: {
  transcript: TranscriptTurn[];
  cowDetails?: string | null;
  language?: string | null;
}) {
  const products = await loadProductCatalog();
  const turnCount = transcript.filter((t) => t.role === "farmer").length;
  const systemPrompt = buildSystemPrompt(turnCount, language || "")
    .replace("{{CATALOG}}", formatCatalog(products))
    .replace("{{TRANSCRIPT}}", formatTranscript(transcript));

  const context = cowDetails
    ? `Cow details given so far: ${cowDetails}`
    : "No cow details given yet.";

  const raw = await askGauriAI(systemPrompt, context, 700);
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

  // Resolve the suggested product name back to a real catalog row so the
  // case can carry a proper suggested_product_id, not just free text.
  let suggestedProductRow: GauriProduct | null = null;
  if (parsed.ready && parsed.suggestedProduct) {
    suggestedProductRow =
      products.find((p) => p.name.toLowerCase() === parsed.suggestedProduct.toLowerCase()) || null;
  }

  return { ...parsed, suggestedProductRow };
}
