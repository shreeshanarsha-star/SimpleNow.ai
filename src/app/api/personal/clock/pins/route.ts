import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Personal Tools: Global Clock -- favorite/pinned locations ("MY WORLD").
// Logged-in users get server-side persistence here; guests fall back to
// localStorage entirely client-side (see ClockWidget.tsx), so this route
// is only ever hit for authenticated users.

export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data: pins, error } = await supabase
    .from("personal_clock_pins")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pins });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const locationId = typeof body.location_id === "string" ? body.location_id.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  if (!locationId || !label || !timezone) {
    return NextResponse.json({ error: "location_id, label, and timezone are required." }, { status: 400 });
  }
  const flag = typeof body.flag === "string" ? body.flag : null;
  const countryCode = typeof body.country_code === "string" ? body.country_code : null;
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lon = typeof body.lon === "number" ? body.lon : null;

  const { data: existing } = await supabase
    .from("personal_clock_pins")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = existing ? existing.position + 1 : 0;

  const { data: pin, error } = await supabase
    .from("personal_clock_pins")
    .insert({
      user_id: user.id,
      location_id: locationId,
      label,
      flag,
      country_code: countryCode,
      timezone,
      lat,
      lon,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) {
    // Unique violation -- already pinned, treat as a no-op success.
    if (error.code === "23505") {
      const { data: current } = await supabase
        .from("personal_clock_pins")
        .select("*")
        .eq("user_id", user.id)
        .eq("location_id", locationId)
        .maybeSingle();
      return NextResponse.json({ pin: current, alreadyPinned: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pin });
}

export async function PATCH(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const order = Array.isArray(body.order) ? body.order.filter((x: unknown) => typeof x === "string") : null;
  if (!order || !order.length) {
    return NextResponse.json({ error: "order (array of location_id) is required." }, { status: 400 });
  }
  await Promise.all(
    order.map((locationId: string, index: number) =>
      supabase
        .from("personal_clock_pins")
        .update({ position: index })
        .eq("user_id", user.id)
        .eq("location_id", locationId)
    )
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id");
  if (!locationId) return NextResponse.json({ error: "location_id is required." }, { status: 400 });
  const { error } = await supabase
    .from("personal_clock_pins")
    .delete()
    .eq("user_id", user.id)
    .eq("location_id", locationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
