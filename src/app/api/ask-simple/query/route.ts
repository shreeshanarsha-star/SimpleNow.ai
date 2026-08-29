import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { runAskSimpleQuery } from "@/lib/agent/orchestrator";

export const maxDuration = 60;

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const clientLat = typeof body.clientLat === "number" ? body.clientLat : undefined;
  const clientLon = typeof body.clientLon === "number" ? body.clientLon : undefined;

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  try {
    const result = await runAskSimpleQuery({
      supabase,
      userId: user.id,
      message,
      conversationId,
      clientLat,
      clientLon,
    });
    return NextResponse.json(result);
  } catch (err) {
    // The orchestrator already handles/logs its own internal failures and
    // returns a graceful reply -- reaching here means something structural
    // (e.g. conversation lookup) broke before that safety net engaged.
    console.error("ask-simple/query fatal error:", err);
    return NextResponse.json(
      { error: "Ask Simple is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
