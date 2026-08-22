import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/supabase/requireAdmin";

// Org member roster -- powers the @mention autocomplete in the composer.
export async function GET() {
  let supabase, orgId;
  try {
    ({ supabase, orgId } = await requireOrgMember());
  } catch (res) {
    return res as Response;
  }

  if (!orgId) return NextResponse.json({ members: [] });

  const { data: members, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("org_id", orgId)
    .order("full_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members });
}
