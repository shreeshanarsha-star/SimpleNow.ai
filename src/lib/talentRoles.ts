import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Talent.ai role tags. Independent of profiles.is_admin -- a person can
// hold several of these at once (e.g. TA Head who also recruits).
export type TalentRole =
  | "hiring_manager"
  | "reporting_manager"
  | "hr_approver"
  | "ta_head"
  | "recruiter"
  | "hr_ops"
  | "admin";

export const TALENT_ROLES: TalentRole[] = [
  "hiring_manager",
  "reporting_manager",
  "hr_approver",
  "ta_head",
  "recruiter",
  "hr_ops",
  "admin",
];

export type ApprovalStepRole = "reporting_manager" | "hr_approver";

// Fixed two-step chain: reporting manager (named, from profiles.manager_id)
// then HR approver (role pool -- no single named HR head required today).
// Kept as a function rather than a database rules table so it's easy to
// extend with department/level/comp conditions later without a migration.
export async function buildApprovalChain(
  admin: SupabaseClient,
  requesterId: string
): Promise<{ step_order: number; approver_role: ApprovalStepRole; approver_user_id: string | null }[]> {
  const { data: profile } = await admin
    .from("profiles")
    .select("manager_id")
    .eq("id", requesterId)
    .maybeSingle();

  return [
    { step_order: 1, approver_role: "reporting_manager", approver_user_id: profile?.manager_id ?? null },
    { step_order: 2, approver_role: "hr_approver", approver_user_id: null },
  ];
}

// Org admins (and the platform owner) act as every Talent.ai role inside
// their own org -- oversight/support capability, and also means one admin
// account can exercise the whole workflow (recruiter, hiring manager,
// reporting manager, HR approver, TA head) without needing a separate
// login per role.
export async function getUserRoles(admin: SupabaseClient, userId: string): Promise<TalentRole[]> {
  const { data: profile } = await admin.from("profiles").select("is_admin, org_role").eq("id", userId).maybeSingle();
  if (profile?.is_admin || profile?.org_role === "org_admin") {
    return [...TALENT_ROLES];
  }
  const { data } = await admin.from("talent_user_roles").select("role").eq("user_id", userId);
  return (data || []).map((r) => r.role as TalentRole);
}

export async function hasTalentRole(
  admin: SupabaseClient,
  userId: string,
  role: TalentRole
): Promise<boolean> {
  const { data: profile } = await admin.from("profiles").select("is_admin, org_role").eq("id", userId).maybeSingle();
  if (profile?.is_admin || profile?.org_role === "org_admin") return true;
  const { data } = await admin
    .from("talent_user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return !!data;
}

// Append-only audit trail. Fire-and-forget is fine here -- an audit log
// failure should never block the underlying action, but we do await it so
// ordering in the log matches the order actions actually happened.
export async function logAudit(params: {
  entityType: string;
  entityId: string;
  actorId: string | null;
  action: string;
  detail?: Record<string, unknown>;
  orgId?: string | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("talent_audit_log").insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      actor_id: params.actorId,
      action: params.action,
      detail: params.detail ?? null,
      org_id: params.orgId ?? null,
    });
  } catch {
    // Never let audit logging break the caller.
  }
}

export async function notifyUser(params: {
  userId: string;
  title: string;
  body?: string | null;
  link?: string | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: params.userId,
      feature_key: "Talent.ai",
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
      channel: "in_app",
    });
  } catch {
    // Best-effort -- never block the action that triggered the notification.
  }
}
