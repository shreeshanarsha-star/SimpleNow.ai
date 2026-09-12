import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateAutomaticEventName,
  processEventIntelligence,
  constructEventReport,
} from "@/lib/intelexaAI";
import { deliverEventIntelligence } from "@/lib/intelexaDelivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      transcript_text = "",
      transcript_segments = [],
      duration_seconds = 0,
      auto_name = false,
      user_notes = "",
      attachments = [],
    } = body;

    let rawTranscriptText = (transcript_text || "").trim();
    let rawTranscriptSegments = transcript_segments || [];

    // If no transcript was provided in request body, retrieve existing saved transcript
    if (!rawTranscriptText) {
      const { data: existingTranscript } = await supabase
        .from("intelexa_transcripts")
        .select("full_text, segments")
        .eq("event_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingTranscript?.full_text?.trim()) {
        rawTranscriptText = existingTranscript.full_text.trim();
        rawTranscriptSegments = existingTranscript.segments || [];
      }
    }

    if (!rawTranscriptText) {
      return NextResponse.json(
        { error: "No transcript content was found or provided for analysis." },
        { status: 400 }
      );
    }

    // 1. Fetch Event
    const { data: event, error: eventErr } = await supabase
      .from("intelexa_events")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // 2. Fetch User Profile
    const { data: profile } = await supabase
      .from("intelexa_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const userProfileContext = profile || {
      name: user.email?.split("@")[0] || "User",
      email: user.email || "",
      what_matters_to_me: "Business opportunities, executive intelligence, and strategic connections.",
    };

    // Update metadata with user notes and slide attachments
    const existingMetadata = (event.metadata && typeof event.metadata === "object") ? event.metadata : {};
    const updatedMetadata = {
      ...existingMetadata,
      user_notes: user_notes || existingMetadata.user_notes || "",
      attachments_count: attachments.length,
      attachments_summary: attachments.map((a: any) => ({
        name: a.name,
        type: a.type,
        size: a.size,
      })),
    };

    // 3. Store Raw Transcript FIRST so speech is never lost
    await supabase.from("intelexa_transcripts").delete().eq("event_id", id);
    const { error: transcriptInsertErr } = await supabase.from("intelexa_transcripts").insert({
      event_id: id,
      user_id: user.id,
      full_text: rawTranscriptText,
      segments: rawTranscriptSegments,
    });
    if (transcriptInsertErr) {
      console.error("[intelexa:analyse] Failed to store transcript:", transcriptInsertErr);
    }

    // 4. Mark Event as Processing
    await supabase
      .from("intelexa_events")
      .update({
        recording_status: "stopped",
        processing_status: "processing",
        processing_step: "Mining opportunities, slides, and personal notes...",
        duration_seconds: Math.max(duration_seconds, event.duration_seconds || 0),
        end_time: new Date().toISOString(),
        metadata: updatedMetadata,
      })
      .eq("id", id);

    // 5. Multi-Stage AI Intelligence Extraction (Fused with Slides & User Notes)
    const intel = await processEventIntelligence(
      rawTranscriptText,
      userProfileContext,
      {
        event_name: event.event_name,
        event_type: event.event_type,
        objectives: event.objectives,
        watch_for: event.watch_for,
        location: event.location,
        duration_seconds: Math.max(duration_seconds, event.duration_seconds || 0),
        user_notes: user_notes || existingMetadata.user_notes || "",
        attachments,
      }
    );

    // 6. Name Resolution (Use title generated in single-pass extraction if title was blank)
    let finalEventName = event.event_name;
    if (
      auto_name ||
      !finalEventName ||
      finalEventName === "Untitled Event Session" ||
      finalEventName.trim().length === 0
    ) {
      finalEventName = intel.event_name || (await generateAutomaticEventName(rawTranscriptText));
      await supabase
        .from("intelexa_events")
        .update({ event_name: finalEventName })
        .eq("id", id);
    }

    // 7. Store Intelligence Record
    await supabase.from("intelexa_intelligence").delete().eq("event_id", id);
    const { data: savedIntel } = await supabase
      .from("intelexa_intelligence")
      .insert({
        event_id: id,
        user_id: user.id,
        entities: intel.entities,
        live_signals: intel.live_signals,
        insights: intel.insights,
        people: intel.people,
        companies: intel.companies,
        opportunities: intel.opportunities,
        competitive_intelligence: intel.competitive_intelligence,
        market_intelligence: intel.market_intelligence,
        action_plan: intel.action_plan,
        top_3_recommendations: intel.top_3_recommendations,
        scorecard: intel.scorecard,
      })
      .select()
      .single();

    // 8. Construct Final Report (Instant deterministic compilation from structured data)
    await supabase
      .from("intelexa_events")
      .update({ processing_step: "Constructing executive intelligence report..." })
      .eq("id", id);

    const reportData = await constructEventReport(
      intel,
      {
        event_name: finalEventName,
        event_type: event.event_type,
        location: event.location,
        duration_seconds,
        user_notes,
      },
      userProfileContext
    );

    // 9. Deliver via Email & WhatsApp (Safe non-blocking delivery)
    await supabase
      .from("intelexa_events")
      .update({ processing_step: "Delivering report to recipients..." })
      .eq("id", id);

    const recipients = Array.isArray(event.recipients) && event.recipients.length > 0
      ? event.recipients
      : [
          {
            name: userProfileContext.name || "User",
            email: user.email || "",
            whatsapp: userProfileContext.whatsapp_number || "",
            delivery_email: true,
            delivery_whatsapp: Boolean(userProfileContext.whatsapp_number),
            is_primary: true,
          },
        ];

    let delivery: any = {
      emailSent: 0,
      emailFailed: 0,
      whatsappSent: 0,
      whatsappFailed: 0,
      whatsappLinks: [],
      logs: [],
    };

    try {
      delivery = await deliverEventIntelligence({
        eventId: id,
        eventName: finalEventName,
        eventType: event.event_type,
        durationSeconds: duration_seconds,
        executiveBrief: reportData.executive_brief,
        intelligence: intel,
        recipients,
      });
    } catch (deliverErr) {
      console.warn("[intelexa:analyse] Delivery warning (non-fatal):", deliverErr);
    }

    // 10. Store Final Report
    await supabase.from("intelexa_reports").delete().eq("event_id", id);
    const { data: savedReport } = await supabase
      .from("intelexa_reports")
      .insert({
        event_id: id,
        user_id: user.id,
        executive_brief: reportData.executive_brief,
        what_happened: reportData.what_happened,
        full_markdown: reportData.full_markdown,
        email_delivery_status: delivery.emailSent > 0 ? "sent" : delivery.emailFailed > 0 ? "failed" : "idle",
        whatsapp_delivery_status: delivery.whatsappSent > 0 ? "sent" : delivery.whatsappLinks.length > 0 ? "prepared" : "idle",
        delivery_log: delivery.logs,
      })
      .select()
      .single();

    // 11. Mark Event as Complete
    const { data: completedEvent } = await supabase
      .from("intelexa_events")
      .update({
        processing_status: "completed",
        processing_step: "Report Delivered",
        duration_seconds: Math.max(duration_seconds, event.duration_seconds || 0),
      })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json({
      event: completedEvent,
      intelligence: savedIntel,
      report: savedReport,
      delivery,
    });
  } catch (err) {
    console.error("[intelexa:analyse] error:", err);
    await supabase
      .from("intelexa_events")
      .update({
        processing_status: "failed",
        processing_step: "Failed",
        error_message: (err as Error).message || "AI Analysis Error",
      })
      .eq("id", id);

    return NextResponse.json(
      { error: (err as Error).message || "Failed to analyze event" },
      { status: 500 }
    );
  }
}
