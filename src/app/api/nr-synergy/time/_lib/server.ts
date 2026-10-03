import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidTimeZone } from "@/app/tools/nr-synergy/time/_lib/tz";

// Server helpers shared by the Time, Approvals and Team routes.

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** IANA timezone of a country in the org, or UTC when the country isn't set up. */
export async function countryTimezone(supabase: SupabaseClient, orgId: string, countryCode: string): Promise<string> {
  const { data } = await supabase
    .from("nrs_countries")
    .select("timezone")
    .eq("org_id", orgId)
    .eq("code", countryCode)
    .maybeSingle();
  const tz = (data as { timezone: string } | null)?.timezone;
  return isValidTimeZone(tz) ? tz : "UTC";
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function str(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WORK_MODES = ["office", "client_visit", "home", "travel", "trade_fair"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export function isWorkMode(v: unknown): v is WorkMode {
  return typeof v === "string" && (WORK_MODES as readonly string[]).includes(v);
}

export const LEAVE_TYPES = ["annual", "sick", "personal", "unavailable", "unpaid"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === "string" && (LEAVE_TYPES as readonly string[]).includes(v);
}

/** Round a coordinate to 2 decimals (~1 km), or null when not a finite number in range. */
export function roundCoord(v: unknown, limit: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > limit) return null;
  return Math.round(v * 100) / 100;
}
