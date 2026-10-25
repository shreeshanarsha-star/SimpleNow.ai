// Dr.Remi -- tenant access control. Every admin API route resolves the
// caller's membership in the workspace FIRST and only then touches data,
// always filtering by workspace_id. Platform admin status grants nothing
// here on purpose: a tenant's leads are visible to that tenant's members only.
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export type RemiRole = "owner" | "admin" | "rep" | "viewer";
const RANK: Record<RemiRole, number> = { viewer: 1, rep: 2, admin: 3, owner: 4 };

export function roleAtLeast(role: RemiRole, min: RemiRole) {
  return RANK[role] >= RANK[min];
}

export function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export async function requireRemiUser() {
  const { user } = await requireUser();
  if ((user as { is_anonymous?: boolean }).is_anonymous || !user.email) {
    throw jsonError("Please sign in with your SimpleNow account.", 401);
  }
  return { user, admin: createAdminClient() };
}

export async function requireRemi(workspaceId: string, min: RemiRole = "viewer") {
  if (!isUuid(workspaceId)) throw jsonError("Workspace not found.", 404);
  const { user, admin } = await requireRemiUser();
  const { data: m } = await admin
    .from("remi_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m) throw jsonError("Workspace not found.", 404); // don't reveal existence
  const role = m.role as RemiRole;
  if (!roleAtLeast(role, min)) throw jsonError("You don't have permission for this action.", 403);
  return { user, admin, role };
}

/** Wraps a route body so thrown Responses (auth failures) are returned as-is. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[remi]", e);
    return jsonError(e instanceof Error ? e.message : "Something went wrong.", 500);
  }
}

export async function audit(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  actor: string | null,
  action: string,
  detail: Record<string, unknown> = {}
) {
  try {
    await admin.from("remi_audit").insert({ workspace_id: workspaceId, actor, action, detail });
  } catch {
    /* never block the action on audit */
  }
}

export function clean(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\u0000/g, "").trim();
  return s ? s.slice(0, max) : null;
}

export function cleanList(v: unknown, maxItems = 30, maxLen = 80): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  return Array.from(
    new Set(
      arr
        .map((x) => (typeof x === "string" ? x.trim().slice(0, maxLen) : ""))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}
