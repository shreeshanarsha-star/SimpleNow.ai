import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateAutomaticEventName,
  processEventIntelligence,
  constructEventReport,
} from "@/lib/intelexaAI";
import { deliverEventIntelligence } from "@/lib/intelexaDelivery";

export const dynamic = "force-dynamic";

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

    if (!transcript_text.trim()) {
      return NextResponse.json(
        { error: "No transcript content was provided for analysis." },
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

    // 3. Mark Event as Processing
    await supabase
      .from("intelexa_events")
      .update({
        recording_status: "stopped",
        processing_status: "processing",
        processing_step: "Transcribing and extracting entities...",
        duration_seconds,
        end_time: new Date().toISOString(),
        metadata: updatedMetadata,
      })
      .eq("id", id);

    // 4. Auto-generate Name if blank
    let finalEventName = event.event_name;
    if (
      auto_name ||
      !finalEventName ||
      finalEventName === "Untitled Event Session" ||
      finalEventName.trim().length === 0
    ) {
      finalEventName = await generateAutomaticEventName(transcript_text);
      await supabase
        .from("intelexa_events")
        .update({ event_name: finalEventName })
        .eq("id", id);
    }

    // 5. Store Transcript
    await supabase.from("intelexa_transcripts").upsert(
      {
        event_id: id,
        user_id: user.id,
        full_text: transcript_text,
        segments: transcript_segments,
      },
      { onConflict: "event_id" }
    );

    // 6. Multi-Stage AI Intelligence Extraction (Fused with Slides & User Notes)
    await supabase
      .from("intelexa_events")
      .update({ processing_step: "Mining opportunities, slides, and personal notes..." })
      .eq("id", id);

    const intel = await processEventIntelligence(
      transcript_text,
      userProfileContext,
      {
        event_name: finalEventName,
        event_type: event.event_type,
        objectives: event.objectives,
        watch_for: event.watch_for,
        location: event.location,
        duration_seconds,
        user_notes,
        attachments,
      }
    );

    // 7. Store Intelligence
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

    // 8. Construct Final 13-Section Report
    await supabase
      .from("intelexa_events")
      .update({ processing_step: "Constructing polished executive intelligence report..." })
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

    // 9. Deliver via Email & WhatsApp
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

    const delivery = await deliverEventIntelligence({
      eventId: id,
      eventName: finalEventName,
      eventType: event.event_type,
      durationSeconds: duration_seconds,
      executiveBrief: reportData.executive_brief,
      intelligence: intel,
      recipients,
    });

    // 10. Store Final Report
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
        duration_seconds,
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
