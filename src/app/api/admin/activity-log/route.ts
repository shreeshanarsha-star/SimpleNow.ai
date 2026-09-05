import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    await requireAdminUser();
  } catch (res) {
    return res as Response;
  }
  const url = new URL(request.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 100);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data || [] });
}
