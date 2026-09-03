import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

export async function GET(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const url = new URL(request.url);
  const department = url.searchParams.get("department");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();

  let query = supabase.from("jdstudio_requests").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
  if (department) query = query.eq("department", department);
  if (status) query = query.eq("status", status);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(`job_title.ilike.${like},recipient_email.ilike.${like},recipient_name.ilike.${like}`);
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}
