import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_EVENT_ID,
  DEMO_EVENT,
  DEMO_TRANSCRIPT,
  DEMO_INTELLIGENCE,
  DEMO_REPORT,
  DEMO_QA_PAIRS,
} from "@/lib/intelexaDemoData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Handle Demo Event
  if (id === DEMO_EVENT_ID) {
    return NextResponse.json({
      event: DEMO_EVENT,
      transcript: DEMO_TRANSCRIPT,
      intelligence: DEMO_INTELLIGENCE,
      report: DEMO_REPORT,
      qa: DEMO_QA_PAIRS,
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: event, error: eventErr } = await supabase
    .from("intelexa_events")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Fetch associated records
  const [transcriptRes, intelligenceRes, reportRes, qaRes] = await Promise.all([
    supabase
      .from("intelexa_transcripts")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("intelexa_intelligence")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("intelexa_reports")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("intelexa_qa")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return NextResponse.json({
    event,
    transcript: transcriptRes.data || null,
    intelligence: intelligenceRes.data || null,
    report: reportRes.data || null,
    qa: qaRes.data || [],
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (id === DEMO_EVENT_ID) {
    return NextResponse.json({ ok: true, message: "Demo event reset" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("target") || "all"; // 'all' | 'transcript' | 'report'

  try {
    if (target === "transcript") {
      await supabase
        .from("intelexa_transcripts")
        .update({ full_text: "[Deleted by user for privacy]", segments: [] })
        .eq("event_id", id)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true, message: "Transcript deleted." });
    }

    if (target === "report") {
      await supabase
        .from("intelexa_reports")
        .update({ executive_brief: [], what_happened: "", full_markdown: "" })
        .eq("event_id", id)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true, message: "Report deleted." });
    }

    // Default: Delete everything
    const { error } = await supabase
      .from("intelexa_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "Event and all data deleted." });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to delete" },
      { status: 500 }
    );
  }
}
