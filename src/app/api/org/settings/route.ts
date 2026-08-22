import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/supabase/requireAdmin";

// Org admin (or the platform owner) updates their own organization's name.
// Status and plan stay owner-controlled from /admin/organizations.
export async function PATCH(req: Request) {
  let supabase, orgId;
  try {
    ({ supabase, orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) {
    return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Organization name is required." }, { status: 400 });

  const { data, error } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", orgId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ organization: data });
}
