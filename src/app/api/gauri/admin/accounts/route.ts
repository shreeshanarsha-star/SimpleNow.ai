import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["admin", "vet", "agent", "stockist", "paramed"];

// Ported verbatim from askshree-app (v1)'s
// app/api/gauri/admin/accounts/route.js.
export async function GET(req: Request) {
  const account = await getSessionAccount(req);
  if (!account || account.role !== "admin") {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const db = createAdminClient();
  const { data } = await db
    .from("gauri_accounts")
    .select("id, username, role, display_name, active, created_at")
    .order("created_at", { ascending: false });
  return NextResponse.json({ accounts: data || [] });
}

export async function POST(req: Request) {
  const account = await getSessionAccount(req);
  if (!account || account.role !== "admin") {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const { username, password, role, displayName } = await req.json();
  if (!username || !password || !role || !displayName) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password needs at least 6 characters." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("gauri_create_account", {
    p_username: username.trim(),
    p_password: password,
    p_role: role,
    p_display_name: displayName.trim(),
  });
  if (error) {
    return NextResponse.json(
      { error: error.message.includes("duplicate") ? "That username is already taken." : "Could not create that account." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, account: data });
}
