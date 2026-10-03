import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isoWeekday, localDateInTz, type IsoDate } from "@/lib/nrs/dates";
import { requireNrs, type NrsContext, type NrsMember } from "@/lib/nrs/member";

// Server-only helpers shared by the Home, Projects, Knowledge and Help pages
// and their API routes.

// ---------------------------------------------------------------------------
// Members and time
// ---------------------------------------------------------------------------

export interface MemberLite {
  id: string;
  full_name: string;
  designation: string | null;
}

/** IANA timezone of a member's home country (nrs_countries), else UTC. */
export async function memberTimezone(supabase: SupabaseClient, member: Pick<NrsMember, "org_id" | "home_country">): Promise<string> {
  const { data } = await supabase
    .from("nrs_countries")
    .select("timezone")
    .eq("org_id", member.org_id)
    .eq("code", member.home_country)
    .maybeSingle();
  const tz = (data as { timezone: string } | null)?.timezone;
  if (tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return tz;
    } catch {
      // invalid tz in the table: fall back
    }
  }
  return "UTC";
}

/** Monday ("yyyy-mm-dd") of the current week in the given timezone. */
export function mondayInTz(tz: string, now: Date = new Date()): IsoDate {
  const today = localDateInTz(tz, now);
  return addDays(today, -(isoWeekday(today) - 1));
}

/** Active members of the org, by name (RLS: the directory is org-readable). */
export async function listOrgMembers(supabase: SupabaseClient, orgId: string): Promise<MemberLite[]> {
  const { data, error } = await supabase
    .from("nrs_members")
    .select("id, full_name, designation")
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemberLite[];
}

/** id -> full_name for the given member ids. */
export async function memberNames(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data } = await supabase.from("nrs_members").select("id, full_name").in("id", unique);
  for (const r of (data ?? []) as { id: string; full_name: string }[]) out.set(r.id, r.full_name);
  return out;
}

// ---------------------------------------------------------------------------
// API route helpers
// ---------------------------------------------------------------------------

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export type Guarded =
  | { ok: true; ctx: NrsContext; member: NrsMember; supabase: SupabaseClient }
  | { ok: false; res: Response };

/**
 * requireNrs(feature) + "the caller has a member row". Usage:
 *   const g = await guard("help"); if (!g.ok) return g.res;
 */
export async function guard(feature: string): Promise<Guarded> {
  try {
    const { ctx, supabase } = await requireNrs(feature);
    if (!ctx.member) {
      return { ok: false, res: jsonError("You need an NR Synergy member profile to do this.", 403) };
    }
    return { ok: true, ctx, member: ctx.member, supabase };
  } catch (res) {
    if (res instanceof Response) return { ok: false, res };
    return { ok: false, res: jsonError("Something went wrong", 500) };
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Trimmed string or null; undefined when longer than max (invalid). */
export function optText(v: unknown, max: number): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? undefined : s;
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}
