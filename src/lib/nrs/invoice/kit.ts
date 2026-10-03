import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireNrs, type NrsContext, type NrsMember } from "../member";
import { NrsApprovalError } from "../approvals";

// Route kit for the NR Synergy Money / Admin / Contracts / Invoices APIs.
// Every handler is wrapped in run(), which turns thrown Responses (from
// requireNrs), HttpErrors and NrsApprovalErrors into JSON responses.

export const NRS_BUCKET = "nrs-private";
export const SIGNED_URL_SECONDS = 300;

export class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export interface Guarded {
  ctx: NrsContext;
  supabase: SupabaseClient;
  user: User;
  admin: SupabaseClient;
  orgId: string;
}

export interface MemberGuarded extends Guarded {
  member: NrsMember;
}

/** requireNrs(feature) + org + optional role check. Throws on failure. */
export async function guard(feature?: string, role?: "hr" | "finance"): Promise<Guarded> {
  const { ctx, supabase, user } = await requireNrs(feature);
  if (role === "hr" && !ctx.isHr) throw new HttpError("Only HR admins can do this.", 403);
  if (role === "finance" && !ctx.isFinance) throw new HttpError("Only Finance can do this.", 403);
  if (!ctx.orgId) throw new HttpError("Your account isn't linked to an organisation.", 403);
  return { ctx, supabase, user, admin: createAdminClient(), orgId: ctx.orgId };
}

/** guard() that also requires the caller to have an nrs_members row. */
export async function guardMember(feature?: string): Promise<MemberGuarded> {
  const g = await guard(feature);
  if (!g.ctx.member) throw new HttpError("You need an NR Synergy member profile for this. Ask HR to add you.", 403);
  return { ...g, member: g.ctx.member };
}

export async function run(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof HttpError || e instanceof NrsApprovalError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof RangeError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[nrs] route error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}

export function ok<T>(body: T, status = 200): Response {
  return NextResponse.json(body, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Expected a JSON object");
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Invalid JSON body");
  }
}

/** Throw a 500 HttpError for a Supabase error. */
export function dbCheck(error: { message: string } | null, what: string): void {
  if (error) throw new HttpError(`${what}: ${error.message}`, 500);
}

// ---------------------------------------------------------------------------
// Field parsers (throw 400 with a readable message)
// ---------------------------------------------------------------------------

export function str(v: unknown, field: string, opts?: { max?: number; optional?: false }): string;
export function str(v: unknown, field: string, opts: { max?: number; optional: true }): string | null;
export function str(v: unknown, field: string, opts: { max?: number; optional?: boolean } = {}): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (!s) {
    if (opts.optional) return null;
    throw new HttpError(`${field} is required`);
  }
  if (opts.max && s.length > opts.max) throw new HttpError(`${field} is too long (max ${opts.max})`);
  return s;
}

export function isoDate(v: unknown, field: string): string;
export function isoDate(v: unknown, field: string, optional: true): string | null;
export function isoDate(v: unknown, field: string, optional = false): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (optional) return null;
    throw new HttpError(`${field} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new HttpError(`${field} must be a date (yyyy-mm-dd)`);
  }
  return s;
}

export function currency(v: unknown, field = "Currency"): string {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(s)) throw new HttpError(`${field} must be a 3-letter ISO code`);
  return s;
}

export function countryCode(v: unknown, field = "Country"): string {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(s)) throw new HttpError(`${field} must be a 2-letter ISO code`);
  return s;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new HttpError(`${field} must be one of: ${allowed.join(", ")}`);
}

export function uuid(v: unknown, field: string): string {
  if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
  throw new HttpError(`${field} is not a valid id`);
}

export function strArray(v: unknown, field: string, max = 50): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new HttpError(`${field} must be a list`);
  const out = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  if (out.length > max) throw new HttpError(`${field} has too many items`);
  return out;
}

export function intOrNull(v: unknown, field: string, min = 0, max = 1_000_000): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(`${field} must be a whole number`);
  return n;
}

export function jsonObject(v: unknown, field: string): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new HttpError(`${field} must be an object`);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function fileExt(file: File): string | null {
  return EXT_BY_TYPE[file.type] ?? null;
}

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** True when the file's leading bytes match the declared content type (the client-sent MIME type is not trusted). */
export function contentMatchesType(bytes: Uint8Array, contentType: string): boolean {
  switch (contentType) {
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8); // RIFF....WEBP
    case "image/heic": {
      if (!startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return false; // ....ftyp
      const brand = String.fromCharCode(...Array.from(bytes.slice(8, 12)));
      return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
    }
    default:
      return false;
  }
}

export async function uploadPrivate(admin: SupabaseClient, path: string, file: File | Uint8Array, contentType: string): Promise<void> {
  const body = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  if (!contentMatchesType(body, contentType)) throw new HttpError("The file's contents don't match its type", 400);
  const { error } = await admin.storage.from(NRS_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new HttpError(`Upload failed: ${error.message}`, 500);
}

/** Signed URL for an object in the caller's org folder only (paths are "{org_id}/..."). */
export async function signedUrlInOrg(admin: SupabaseClient, orgId: string, path: string, downloadName?: string): Promise<string> {
  if (!path.startsWith(`${orgId}/`) || path.includes("..")) throw new HttpError("File not found", 404);
  return signedUrl(admin, path, downloadName);
}

export async function signedUrl(admin: SupabaseClient, path: string, downloadName?: string): Promise<string> {
  const { data, error } = await admin.storage
    .from(NRS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new HttpError(error?.message ?? "Could not create a link", 500);
  return data.signedUrl;
}
