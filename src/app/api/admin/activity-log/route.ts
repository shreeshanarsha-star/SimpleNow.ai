import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }
  const url = new URL(request.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 100);

  const client = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
  const { data, error } = await client
    .from("admin_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data || [] });
}
