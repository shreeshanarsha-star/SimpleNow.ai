import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch events for user, ordered by most recent first
  const { data: events, error } = await supabase
    .from("intelexa_events")
    .select(`
      id,
      event_name,
      event_type,
      objectives,
      watch_for,
      start_time,
      end_time,
      duration_seconds,
      location,
      recording_status,
      processing_status,
      processing_step,
      error_message,
      is_demo,
      recipients,
      created_at
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch real user intelligence data for dynamic roll-up stats
  const { data: intelligences } = await supabase
    .from("intelexa_intelligence")
    .select("opportunities, people, action_plan")
    .eq("user_id", user.id);

  let totalConnections = 0;
  let keyConnections = 0;
  let actionItemsCreated = 0;

  (intelligences || []).forEach((intel) => {
    if (Array.isArray(intel.people)) {
      totalConnections += intel.people.length;
      keyConnections += intel.people.filter(
        (p: any) =>
          p.priority === "HIGH" ||
          p.priority === "High" ||
          (typeof p.interest === "string" && p.interest.toLowerCase().includes("high"))
      ).length;
    }
    if (intel.action_plan && typeof intel.action_plan === "object") {
      const plan = intel.action_plan as any;
      actionItemsCreated +=
        (Array.isArray(plan.do_today) ? plan.do_today.length : 0) +
        (Array.isArray(plan.do_this_week) ? plan.do_this_week.length : 0) +
        (Array.isArray(plan.do_later) ? plan.do_later.length : 0);
    }
  });

  return NextResponse.json({
    events: events || [],
    stats: {
      totalEvents: (events || []).length,
      connections: totalConnections,
      keyConnections,
      keyPeopleConnected: totalConnections,
      highValueOpportunities: keyConnections,
      actionItemsCreated,
    },
  });
}

export async function POST(req: Request) {
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
      event_name,
      event_type = "Conference",
      objectives = [],
      watch_for = "",
      location = "",
      recipients = [],
    } = body;

    const initialName = event_name?.trim() || "Untitled Event Session";

    const { data: event, error } = await supabase
      .from("intelexa_events")
      .insert({
        user_id: user.id,
        event_name: initialName,
        event_type,
        objectives,
        watch_for,
        location,
        recipients,
        start_time: new Date().toISOString(),
        recording_status: "recording",
        processing_status: "idle",
        processing_step: "Listening",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to create event" },
      { status: 500 }
    );
  }
}
