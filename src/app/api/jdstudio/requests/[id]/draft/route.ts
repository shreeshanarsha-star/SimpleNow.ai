import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { runDraftPipeline } from "@/lib/jdstudio/pipeline";
import type { JdStudioRequest } from "@/lib/jdstudio/types";

// Manual trigger for the draft pipeline -- used for the sample_jd path
// (no recipient to email; the user reviews the AI-prefilled answers, then
// clicks "Draft JD"), and doubles as a "regenerate" action from pending_approval.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: req } = await supabase.from("jdstudio_requests").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!req) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!["pending_review", "responded", "pending_approval", "failed"].includes(req.status)) {
    return NextResponse.json({ error: `Can't draft from status "${req.status}".` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const answers = body.answers && typeof body.answers === "object" ? body.answers : req.answers;

  if (req.status === "pending_review") {
    await supabase.from("jdstudio_requests").update({ answers, status: "responded" }).eq("id", id);
  }

  const result = await runDraftPipeline({ ...req, answers } as JdStudioRequest, user.email || null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  const { data: updated } = await supabase.from("jdstudio_requests").select("*").eq("id", id).single();
  return NextResponse.json({ request: updated });
}
