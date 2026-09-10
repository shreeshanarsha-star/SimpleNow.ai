import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askIntelexa } from "@/lib/intelexaAI";
import {
  DEMO_EVENT_ID,
  DEMO_EVENT,
  DEMO_TRANSCRIPT,
  DEMO_INTELLIGENCE,
  DEMO_REPORT,
  DEMO_QA_PAIRS,
} from "@/lib/intelexaDemoData";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { question } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    // Handle Demo Event
    if (id === DEMO_EVENT_ID) {
      const match = DEMO_QA_PAIRS.find(
        (q) => q.question.toLowerCase().includes(question.toLowerCase().slice(0, 15))
      );

      if (match) {
        return NextResponse.json({
          answer: match.answer,
          citations: match.citations,
        });
      }

      // If no pre-canned match, call AI with demo context
      try {
        const qaResult = await askIntelexa(question, {
          event_name: DEMO_EVENT.event_name,
          transcriptText: DEMO_TRANSCRIPT.full_text,
          intelligence: DEMO_INTELLIGENCE as any,
          reportMarkdown: DEMO_REPORT.full_markdown,
        });
        return NextResponse.json(qaResult);
      } catch {
        return NextResponse.json({
          answer: `Based on TechSparks 2026 Bengaluru: The primary consensus between Rahul Sharma (ABC Corp) and Priya Nair (CloudForge) was that enterprise recruitment is shifting toward autonomous agentic workflows, but requires calibrated scoring with verifiable CV citations [00:12:35] and open, modular infrastructure rather than LinkedIn's $18k/seat lock-in [00:22:10].`,
          citations: ["00:12:35", "00:22:10"],
        });
      }
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [eventRes, transcriptRes, reportRes, intelRes] = await Promise.all([
      supabase.from("intelexa_events").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("intelexa_transcripts").select("*").eq("event_id", id).maybeSingle(),
      supabase.from("intelexa_reports").select("*").eq("event_id", id).maybeSingle(),
      supabase.from("intelexa_intelligence").select("*").eq("event_id", id).maybeSingle(),
    ]);

    if (!eventRes.data) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const qaResult = await askIntelexa(question, {
      event_name: eventRes.data.event_name,
      transcriptText: transcriptRes.data?.full_text || "",
      intelligence: intelRes.data as any,
      reportMarkdown: reportRes.data?.full_markdown || "",
    });

    // Save to intelexa_qa table
    await supabase.from("intelexa_qa").insert({
      event_id: id,
      user_id: user.id,
      question: question.trim(),
      answer: qaResult.answer,
      citations: qaResult.citations,
    });

    return NextResponse.json(qaResult);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to process question" },
      { status: 500 }
    );
  }
}
