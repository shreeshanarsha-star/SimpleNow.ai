import { cache } from "react";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

// NR Synergy: who is the caller inside the intranet?
//
// getNrsContext() is the one place that answers "which nrs_members row is
// this, what roles and feature switches does it have, and what kind of
// engagement is it on". Server components call it directly (it is wrapped
// in React cache(), so the layout and the page share one lookup per
// request). API routes call requireNrs(feature) instead, which also runs
// the platform's org licence check first.
//
// All reads here use the caller's own (RLS) client: every table touched
// has a select policy that lets a member read their own rows.

export const NRS_FEATURE_KEY = "NR Synergy";

export type NrsRole =
  | "employee"
  | "manager"
  | "hr_admin"
  | "finance"
  | "super_admin"
  | "it_agent"
  | "hr_agent"
  | "travel_desk";

/** Which desks (agent workspaces) the caller may open. Both need a member profile. */
export interface NrsDeskAccess {
  /** Support desk: IT / HR agents, HR admins, super admins. */
  support: boolean;
  /** Travel desk: travel desk role, HR admins, super admins. */
  travel: boolean;
}
export type NrsEngagementType = "consultant" | "payroll";

export interface NrsMember {
  id: string;
  org_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  designation: string | null;
  department: string | null;
  division: string | null;
  home_country: string;
  manager_id: string | null;
  languages: string[];
  bio: string | null;
  avatar_url: string | null;
  joined_on: string | null;
  left_on: string | null;
  status: "active" | "inactive";
  theme: "nr-green" | "light" | "onyx";
  locale: "en" | "es" | "pt" | "de";
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NrsContext {
  user: User;
  member: NrsMember | null;
  roles: NrsRole[];
  /** Effective per-feature switches, keyed by nrs_features.key. */
  features: Record<string, boolean>;
  engagementType: NrsEngagementType | null;
  isManager: boolean;
  isHr: boolean;
  isFinance: boolean;
  /** profiles.is_admin (platform owner). Implies isHr and isFinance. */
  isPlatformAdmin: boolean;
  /** Desk workspaces the caller can use (see NrsDeskAccess). */
  desk: NrsDeskAccess;
  orgId: string | null;
  /** First name for greetings: member name, else profile name, else email. */
  firstName: string;
}

// Fallback when the feature catalogue can't be read (mirrors the seed in the migration).
const FALLBACK_FEATURES: Record<string, boolean> = {
  home: true,
  time: true,
  money: true,
  projects: true,
  people: true,
  knowledge: true,
  help: true,
  search_ai: true,
};

const ROLE_SET = new Set<NrsRole>([
  "employee",
  "manager",
  "hr_admin",
  "finance",
  "super_admin",
  "it_agent",
  "hr_agent",
  "travel_desk",
]);

function firstNameOf(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

async function loadContext(supabase: SupabaseClient): Promise<NrsContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profileRow }, { data: memberRow }, { data: featureRows }] = await Promise.all([
    supabase.from("profiles").select("is_admin, org_id, full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("nrs_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("nrs_features").select("key, default_on"),
  ]);

  const profile = profileRow as { is_admin: boolean | null; org_id: string | null; full_name: string | null } | null;
  const member = (memberRow as NrsMember | null) ?? null;
  const isPlatformAdmin = !!profile?.is_admin;

  let roles: NrsRole[] = [];
  let overrides: { feature_key: string; enabled: boolean }[] = [];
  let engagementType: NrsEngagementType | null = null;
  let hasReports = false;

  if (member) {
    const [rolesRes, overridesRes, engagementRes, reportsRes] = await Promise.all([
      supabase.from("nrs_member_roles").select("role").eq("member_id", member.id),
      supabase.from("nrs_member_features").select("feature_key, enabled").eq("member_id", member.id),
      supabase.rpc("nrs_engagement_type", { m: member.id }),
      supabase
        .from("nrs_members")
        .select("id", { count: "exact", head: true })
        .eq("manager_id", member.id)
        .eq("status", "active")
        .is("deleted_at", null),
    ]);
    roles = ((rolesRes.data ?? []) as { role: string }[])
      .map((r) => r.role)
      .filter((r): r is NrsRole => ROLE_SET.has(r as NrsRole));
    overrides = (overridesRes.data ?? []) as { feature_key: string; enabled: boolean }[];
    const eng: unknown = engagementRes.data;
    engagementType = eng === "consultant" || eng === "payroll" ? eng : null;
    hasReports = (reportsRes.count ?? 0) > 0;
  }

  const isSuper = roles.includes("super_admin");
  const isHr = isPlatformAdmin || isSuper || roles.includes("hr_admin");
  const isFinance = isPlatformAdmin || isSuper || roles.includes("finance");
  const isManager = hasReports || roles.includes("manager");
  const desk: NrsDeskAccess = {
    support: !!member && (isHr || roles.includes("it_agent") || roles.includes("hr_agent")),
    travel: !!member && (isHr || roles.includes("travel_desk")),
  };

  const catalogue = (featureRows ?? []) as { key: string; default_on: boolean }[];
  const features: Record<string, boolean> = {};
  if (catalogue.length) {
    for (const f of catalogue) features[f.key] = f.default_on;
  } else {
    Object.assign(features, FALLBACK_FEATURES);
  }
  for (const o of overrides) features[o.feature_key] = o.enabled;
  if (isHr) for (const k of Object.keys(features)) features[k] = true;

  const firstName =
    firstNameOf(member?.full_name) ??
    firstNameOf(profile?.full_name) ??
    (user.email ? user.email.split("@")[0] : "there");

  return {
    user,
    member,
    roles,
    features,
    engagementType,
    isManager,
    isHr,
    isFinance,
    isPlatformAdmin,
    desk,
    orgId: member?.org_id ?? profile?.org_id ?? null,
    firstName,
  };
}

/**
 * The caller's NR Synergy context, or null when not signed in.
 * Cached per request: safe to call from both the layout and the page.
 * Does NOT check the org licence; the layout / requireNrs() do that.
 */
export const getNrsContext = cache(async (): Promise<NrsContext | null> => {
  const supabase = await createClient();
  return loadContext(supabase);
});

/** True when the caller may enter NR Synergy at all (a member row, or HR / platform admin). */
export function hasNrsAccess(ctx: NrsContext | null): ctx is NrsContext {
  return !!ctx && (!!ctx.member || ctx.isHr);
}

/**
 * The org-licence error message for NR Synergy, or null when the caller's org
 * may use it. Shared by the employee layout and the Admin Console layout.
 */
export async function nrsLicenceError(fallback: string): Promise<string | null> {
  try {
    await requireFeatureAccess(NRS_FEATURE_KEY);
    return null;
  } catch (res) {
    if (res instanceof Response) {
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") return body.error;
      } catch {
        // fall through to the generic message
      }
    }
    return fallback;
  }
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Guard for every /api/nr-synergy route. Mirrors requireFeatureAccess():
 * on failure it THROWS a Response (401/403/503 JSON), so routes use
 *
 *   let g; try { g = await requireNrs("time"); } catch (res) { return res as Response; }
 *
 * Order: org licence for "NR Synergy" -> member context -> feature switch.
 * Role checks (isHr / isManager / isFinance) are left to the route.
 */
export async function requireNrs(
  feature?: string
): Promise<{ ctx: NrsContext; supabase: SupabaseClient; user: User }> {
  const { supabase, user } = await requireFeatureAccess(NRS_FEATURE_KEY);
  const ctx = await loadContext(supabase);
  if (!ctx) {
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!hasNrsAccess(ctx)) {
    throw forbidden("You don't have access to NR Synergy yet. Ask your admin to add you.");
  }
  if (feature && !ctx.features[feature]) {
    throw forbidden(`The "${feature}" feature is switched off for your account.`);
  }
  return { ctx, supabase, user };
}
