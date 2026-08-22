import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Self-serve org creation for anyone signed in with no org yet -- the
// email/password signup form collects the org name up front and the
// handle_new_user trigger creates it at insert time; OAuth (Google) has
// no form step before the account exists, so this covers that path
// (and anyone else who somehow ended up without one).
export async function POST(req: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (profile?.org_id) {
    return NextResponse.json({ error: "You're already part of an organization." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Organization name is required." }, { status: 400 });

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, status: "pending", owner_user_id: user.id })
    .select()
    .single();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ org_id: org.id, org_role: "org_admin" })
    .eq("id", user.id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ organization: org });
}
