import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deliverEventIntelligence } from "@/lib/intelexaDelivery";
import type { ExtractedIntelligence } from "@/lib/intelexaAI";

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
    const body = await req.json().catch(() => ({}));
    const channelFilter = body.channel; // 'email' | 'whatsapp' | undefined

    const [eventRes, reportRes, intelRes] = await Promise.all([
      supabase.from("intelexa_events").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("intelexa_reports").select("*").eq("event_id", id).maybeSingle(),
      supabase.from("intelexa_intelligence").select("*").eq("event_id", id).maybeSingle(),
    ]);

    if (!eventRes.data || !reportRes.data) {
      return NextResponse.json({ error: "Event or report not found" }, { status: 404 });
    }

    const event = eventRes.data;
    const report = reportRes.data;
    const intelligence = intelRes.data as unknown as ExtractedIntelligence;

    const recipients = Array.isArray(event.recipients) && event.recipients.length > 0
      ? event.recipients.map((r: any) => ({
          ...r,
          delivery_email: channelFilter === "whatsapp" ? false : r.delivery_email,
          delivery_whatsapp: channelFilter === "email" ? false : r.delivery_whatsapp,
        }))
      : [
          {
            name: "User",
            email: user.email || "",
            whatsapp: "",
            delivery_email: channelFilter !== "whatsapp",
            delivery_whatsapp: channelFilter !== "email",
            is_primary: true,
          },
        ];

    const delivery = await deliverEventIntelligence({
      eventId: id,
      eventName: event.event_name,
      eventType: event.event_type,
      durationSeconds: event.duration_seconds || 0,
      executiveBrief: report.executive_brief || [],
      intelligence: intelligence || ({} as ExtractedIntelligence),
      recipients,
    });

    // Append to delivery log
    const currentLogs = Array.isArray(report.delivery_log) ? report.delivery_log : [];
    const updatedLogs = [...currentLogs, ...delivery.logs];

    await supabase
      .from("intelexa_reports")
      .update({
        email_delivery_status: delivery.emailSent > 0 ? "sent" : delivery.emailFailed > 0 ? "failed" : report.email_delivery_status,
        whatsapp_delivery_status: delivery.whatsappSent > 0 ? "sent" : delivery.whatsappLinks.length > 0 ? "prepared" : report.whatsapp_delivery_status,
        delivery_log: updatedLogs,
      })
      .eq("event_id", id);

    return NextResponse.json({ ok: true, delivery });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to redeliver" },
      { status: 500 }
    );
  }
}
