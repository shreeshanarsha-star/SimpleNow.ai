import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { structureCriteria } from "@/lib/smartScreen";

export const maxDuration = 30;
const FEATURE_KEY = "Smart Screen.ai";

export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const jdText = typeof body?.jdText === "string" ? body.jdText.trim() : "";
  if (!jdText) {
    return NextResponse.json({ error: "Paste a job description first." }, { status: 400 });
  }

  try {
    const criteria = await structureCriteria(jdText);
    return NextResponse.json({ criteria });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not structure criteria: ${message}` }, { status: 502 });
  }
}
