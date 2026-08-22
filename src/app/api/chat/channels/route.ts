import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/supabase/requireAdmin";

// Team Chat channels -- org-scoped, any member can create one (v1 has no
// private channels: everything in an org is visible to the whole org,
// same trust boundary Talent.ai etc. already use).
export async function GET() {
  let supabase, orgId;
  try {
    ({ supabase, orgId } = await requireOrgMember());
  } catch (res) {
    return res as Response;
  }

  if (!orgId) return NextResponse.json({ channels: [] });

  const { data: channels, error } = await supabase
    .from("chat_channels")
    .select("id, name, description, created_by, created_at")
    .eq("org_id", orgId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels });
}

export async function POST(req: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireOrgMember());
  } catch (res) {
    return res as Response;
  }

  if (!orgId) {
    return NextResponse.json(
      { error: "Your account isn't part of an organization yet." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;

  if (!name) return NextResponse.json({ error: "Channel name is required." }, { status: 400 });

  const { data: channel, error } = await supabase
    .from("chat_channels")
    .insert({ org_id: orgId, name, description, created_by: user.id })
    .select("id, name, description, created_by, created_at")
    .single();

  if (error) {
    const message = error.code === "23505" ? `#${name} already exists.` : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ channel });
}
