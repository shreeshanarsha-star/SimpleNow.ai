import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// RLS already scopes results correctly (admin sees all batches, a granted
// user sees only their own) -- this route just needs a signed-in user.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: batches, error } = await supabase
    .from("smart_screen_batches")
    .select("*, smart_screen_candidates(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ batches });
}
