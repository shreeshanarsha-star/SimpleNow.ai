import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Personal Tools: Calendar reminders/notes attached to a day. Same
// "personal, not feature-gated" pattern. ?month=YYYY-MM narrows the range
// so the calendar only fetches the month it's showing.
export async function GET(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "YYYY-MM"

  let query = supabase.from("personal_events").select("*").order("event_date", { ascending: true });
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const endDate = new Date(y, m, 0).getDate();
    const end = `${month}-${String(endDate).padStart(2, "0")}`;
    query = query.gte("event_date", start).lte("event_date", end);
  }
  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const eventDate = typeof body.eventDate === "string" ? body.eventDate : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!eventDate || !title) {
    return NextResponse.json({ error: "eventDate and title are required." }, { status: 400 });
  }

  const { data: event, error } = await supabase
    .from("personal_events")
    .insert({ user_id: user.id, event_date: eventDate, title })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event });
}
