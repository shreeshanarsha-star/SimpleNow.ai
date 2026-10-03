import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "../dates";
import { HttpError, countryCode, dbCheck, isoDate, oneOf, str, uuid } from "./kit";
import { NRS_ROLES, type AdminMemberDto, type AdminRole } from "./adminTypes";

// Member admin: parsing, loading and the role / feature / engagement writes.

export interface MemberInput {
  email?: string;
  fields: Record<string, unknown>;
  roles?: AdminRole[];
  features?: Record<string, boolean | null>;
  engagement?: { type: "consultant" | "payroll"; country_code: string; starts_on: string };
}

export function parseMemberInput(b: Record<string, unknown>, creating: boolean): MemberInput {
  const fields: Record<string, unknown> = {};
  const out: MemberInput = { fields };
  const has = (k: string) => creating || k in b;
  if (has("full_name")) fields.full_name = str(b.full_name, "Name", { max: 200 });
  if (has("email")) {
    const email = str(b.email, "Email", { max: 320 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("Email is not valid");
    fields.email = email;
    out.email = email;
  }
  for (const k of ["designation", "department", "division"] as const) {
    if (has(k)) fields[k] = str(b[k], k, { optional: true, max: 200 });
  }
  if (has("home_country")) fields.home_country = countryCode(b.home_country, "Home country");
  if (has("manager_id")) fields.manager_id = b.manager_id ? uuid(b.manager_id, "Manager") : null;
  if (has("joined_on")) fields.joined_on = isoDate(b.joined_on, "Joined on", true);
  if ("status" in b) fields.status = oneOf(b.status, ["active", "inactive"] as const, "Status");
  if ("roles" in b || creating) {
    const raw = Array.isArray(b.roles) ? b.roles : [];
    const roles = new Set<AdminRole>(["employee"]);
    for (const r of raw) roles.add(oneOf(r, NRS_ROLES, "Role"));
    out.roles = Array.from(roles);
  }
  if ("features" in b && b.features && typeof b.features === "object") {
    const f: Record<string, boolean | null> = {};
    for (const [k, v] of Object.entries(b.features as Record<string, unknown>)) {
      if (!/^[a-z_]{1,40}$/.test(k)) throw new HttpError(`Unknown feature "${k}"`);
      f[k] = v === null ? null : !!v;
    }
    out.features = f;
  }
  if ("engagement" in b && b.engagement) {
    const e = b.engagement as Record<string, unknown>;
    out.engagement = {
      type: oneOf(e.type, ["consultant", "payroll"] as const, "Engagement type"),
      country_code: countryCode(e.country_code, "Engagement country"),
      starts_on: isoDate(e.starts_on, "Engagement start"),
    };
  } else if (creating) {
    throw new HttpError("Engagement type, country and start date are required");
  }
  return out;
}

/** Escape LIKE wildcards so ilike() is a case-insensitive exact match. */
function likeExact(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Platform account (profiles) with this email in the same org, or null. Never links across orgs. */
export async function findProfileInOrg(admin: SupabaseClient, orgId: string, email: string): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", likeExact(email))
    .limit(1)
    .maybeSingle();
  dbCheck(error, "Account lookup");
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Checks shared by create/update: the manager must be an active member of the
 * same org, and only a super admin (or platform owner) may grant or remove
 * super_admin.
 */
export async function assertMemberInputAllowed(
  admin: SupabaseClient,
  orgId: string,
  input: MemberInput,
  actor: { isSuperAdmin: boolean },
  currentRoles: readonly AdminRole[] = []
): Promise<void> {
  const managerId = input.fields.manager_id;
  if (typeof managerId === "string") {
    const { data, error } = await admin
      .from("nrs_members")
      .select("id")
      .eq("id", managerId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    dbCheck(error, "Manager");
    if (!data) throw new HttpError("Manager not found in this organisation", 400);
  }
  if (input.roles && !actor.isSuperAdmin) {
    const had = currentRoles.includes("super_admin");
    const has = input.roles.includes("super_admin");
    if (had !== has) throw new HttpError("Only a super admin can grant or remove the super admin role", 403);
  }
}

export async function applyMemberChanges(
  admin: SupabaseClient,
  orgId: string,
  memberId: string,
  input: MemberInput,
  actorUser: string
): Promise<void> {
  if (input.roles) {
    const del = await admin.from("nrs_member_roles").delete().eq("member_id", memberId);
    dbCheck(del.error, "Roles");
    const ins = await admin.from("nrs_member_roles").insert(input.roles.map((role) => ({ member_id: memberId, role })));
    dbCheck(ins.error, "Roles");
  }
  if (input.features) {
    for (const [key, enabled] of Object.entries(input.features)) {
      if (enabled === null) {
        const { error } = await admin.from("nrs_member_features").delete().eq("member_id", memberId).eq("feature_key", key);
        dbCheck(error, "Feature switch");
      } else {
        const { error } = await admin
          .from("nrs_member_features")
          .upsert(
            { member_id: memberId, feature_key: key, enabled, updated_by: actorUser, updated_at: new Date().toISOString() },
            { onConflict: "member_id,feature_key" }
          );
        dbCheck(error, "Feature switch");
      }
    }
  }
  if (input.engagement) {
    const e = input.engagement;
    const { data: cur } = await admin
      .from("nrs_engagements")
      .select("id, type, country_code, starts_on")
      .eq("member_id", memberId)
      .is("deleted_at", null)
      .is("ends_on", null)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    const current = cur as { id: string; type: string; country_code: string; starts_on: string } | null;
    const same = current && current.type === e.type && current.country_code === e.country_code && current.starts_on === e.starts_on;
    if (!same) {
      if (current && current.starts_on < e.starts_on) {
        const { error } = await admin.from("nrs_engagements").update({ ends_on: addDays(e.starts_on, -1) }).eq("id", current.id);
        dbCheck(error, "Ending engagement");
      } else if (current) {
        // Correction of the current engagement (same or earlier start date).
        const { error } = await admin.from("nrs_engagements").update({ deleted_at: new Date().toISOString() }).eq("id", current.id);
        dbCheck(error, "Replacing engagement");
      }
      const { error } = await admin.from("nrs_engagements").insert({ org_id: orgId, member_id: memberId, ...e });
      dbCheck(error, "Engagement");
    }
  }
}

/** True while an invited auth user has never confirmed or signed in. Best-effort. */
async function invitePending(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    return !data.user.email_confirmed_at && !data.user.last_sign_in_at;
  } catch {
    return false;
  }
}

export async function loadAdminMembers(
  admin: SupabaseClient,
  orgId: string,
  opts: { withInviteState?: boolean } = {}
): Promise<AdminMemberDto[]> {
  const { data, error } = await admin
    .from("nrs_members")
    .select("id, full_name, email, designation, department, division, home_country, manager_id, joined_on, status, user_id, is_demo")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("full_name");
  dbCheck(error, "Members");
  const rows = (data ?? []) as (Omit<AdminMemberDto, "linked" | "roles" | "features" | "engagement"> & { user_id: string | null })[];
  const ids = rows.map((r) => r.id);
  const roles = new Map<string, AdminRole[]>();
  const features = new Map<string, Record<string, boolean>>();
  const engagements = new Map<string, AdminMemberDto["engagement"]>();
  if (ids.length) {
    const [r, f, e] = await Promise.all([
      admin.from("nrs_member_roles").select("member_id, role").in("member_id", ids),
      admin.from("nrs_member_features").select("member_id, feature_key, enabled").in("member_id", ids),
      admin
        .from("nrs_engagements")
        .select("member_id, type, country_code, starts_on, ends_on")
        .in("member_id", ids)
        .is("deleted_at", null)
        .order("starts_on", { ascending: true }),
    ]);
    for (const x of (r.data ?? []) as { member_id: string; role: AdminRole }[]) {
      roles.set(x.member_id, [...(roles.get(x.member_id) ?? []), x.role]);
    }
    for (const x of (f.data ?? []) as { member_id: string; feature_key: string; enabled: boolean }[]) {
      features.set(x.member_id, { ...(features.get(x.member_id) ?? {}), [x.feature_key]: x.enabled });
    }
    // Ascending order: the last open engagement wins.
    for (const x of (e.data ?? []) as { member_id: string; type: "consultant" | "payroll"; country_code: string; starts_on: string; ends_on: string | null }[]) {
      if (!x.ends_on) engagements.set(x.member_id, { type: x.type, country_code: x.country_code, starts_on: x.starts_on });
    }
  }
  const pending = new Map<string, boolean>();
  if (opts.withInviteState) {
    const linkedRows = rows.filter((r) => r.user_id && !r.is_demo);
    // Small batches keep the auth admin API from being hammered on large orgs.
    for (let i = 0; i < linkedRows.length; i += 20) {
      const batch = linkedRows.slice(i, i + 20);
      const states = await Promise.all(batch.map((r) => invitePending(admin, r.user_id as string)));
      batch.forEach((r, j) => pending.set(r.id, states[j]));
    }
  }
  return rows.map(({ user_id, ...r }) => ({
    ...r,
    linked: !!user_id,
    ...(opts.withInviteState ? { pending: pending.get(r.id) ?? false } : {}),
    roles: roles.get(r.id) ?? [],
    features: features.get(r.id) ?? {},
    engagement: engagements.get(r.id) ?? null,
  }));
}
