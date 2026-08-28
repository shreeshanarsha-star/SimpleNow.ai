import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

// A self-contained username/password auth layer for the Gauri.ai cattle-
// health module — deliberately separate from the site's own Supabase Auth
// (org/user login) since Gauri.ai staff (vet, agent, stockist, paramed,
// admin) have no relationship to askshree-app-v2's orgs, and farmers never
// get an account at all. Password hashing/verification happens inside
// Postgres via pgcrypto's crypt() so there's no bcrypt dependency here.
// Ported verbatim from askshree-app (v1)'s lib/gauriAuth.js.

const SESSION_DAYS = 30;
export const SESSION_COOKIE = "gauri_session";

export interface GauriAccount {
  id: string;
  username: string;
  role: "admin" | "vet" | "agent" | "stockist" | "paramed";
  displayName: string;
}

export async function verifyLogin(username: string, password: string): Promise<GauriAccount | null> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("gauri_verify_password", { p_username: username, p_password: password });
  if (error || !data || data.length === 0) return null;
  const account = data[0];
  if (!account.active) return null;
  return { id: account.id, username: account.username, role: account.role, displayName: account.display_name };
}

export async function createSession(accountId: string): Promise<{ token: string; expiresAt: string }> {
  const db = createAdminClient();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.from("gauri_sessions").insert({ token, account_id: accountId, expires_at: expiresAt });
  return { token, expiresAt };
}

export async function getSessionAccount(req: Request): Promise<GauriAccount | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  if (!token) return null;

  const db = createAdminClient();
  const { data: session } = await db
    .from("gauri_sessions")
    .select("account_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session || new Date(session.expires_at) < new Date()) return null;

  const { data: account } = await db
    .from("gauri_accounts")
    .select("id, username, role, display_name, active")
    .eq("id", session.account_id)
    .maybeSingle();
  if (!account || !account.active) return null;

  return { id: account.id, username: account.username, role: account.role, displayName: account.display_name };
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const db = createAdminClient();
  await db.from("gauri_sessions").delete().eq("token", token);
}
