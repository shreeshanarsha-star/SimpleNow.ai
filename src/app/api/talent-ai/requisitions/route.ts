import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

// RLS scopes results correctly (admin sees all requisitions, a granted
// user sees only their own) -- this route just needs feature access.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const { data: requisitions, error } = await supabase
    .from("talent_requisitions")
    .select("*, talent_candidates(id, stage)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requisitions });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await req.json();
  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .insert({
      title,
      department: body.department || null,
      location: body.location || null,
      employment_type: body.employmentType || "full-time",
      headcount: Number(body.headcount) || 1,
      status: body.status || "open",
      priority: body.priority || "medium",
      hiring_manager: body.hiringManager || null,
      description: body.description || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requisition });
}
