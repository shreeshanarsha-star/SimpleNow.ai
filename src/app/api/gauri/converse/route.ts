import { NextResponse } from "next/server";
import { continueConversation } from "@/lib/gauriConversation";

export const dynamic = "force-dynamic";

// Public, stateless -- the client (the avatar page) holds the transcript and
// resends it whole each turn. No auth: farmers never get accounts. Kept
// separate from POST /api/gauri/cases, which only runs once the farmer has
// confirmed "yes, have a vet call me" at the end of this conversation.
// Ported verbatim from askshree-app (v1)'s app/api/gauri/converse/route.js.
export async function POST(req: Request) {
  const { transcript, cowDetails, language } = await req.json();
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return NextResponse.json({ error: "No conversation to continue." }, { status: 400 });
  }
  if (transcript.length > 40) {
    return NextResponse.json({ error: "Conversation too long." }, { status: 400 });
  }

  try {
    const result = await continueConversation({ transcript, cowDetails, language });
    return NextResponse.json({
      reply: result.reply,
      detectedLanguage: result.detectedLanguage || null,
      ready: !!result.ready,
      surfaceDiagnosis: result.surfaceDiagnosis || null,
      suggestedProductName: result.suggestedProductRow?.name || null,
      suggestedProductId: result.suggestedProductRow?.id || null,
      urgency: result.urgency || null,
    });
  } catch {
    return NextResponse.json({ error: "Gauri couldn't respond just now. Please try again." }, { status: 500 });
  }
}
