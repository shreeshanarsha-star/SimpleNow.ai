import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({ events: events || [] });
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
