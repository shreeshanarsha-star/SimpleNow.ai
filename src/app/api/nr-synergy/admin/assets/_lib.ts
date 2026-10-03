import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError, dbCheck } from "@/lib/nrs/invoice/kit";

// Shared checks for the assets admin routes (service-role client, org-scoped).

type Admin = SupabaseClient;

export async function assertActiveMember(admin: Admin, orgId: string, memberId: string): Promise<void> {
  const { data, error } = await admin
    .from("nrs_members")
    .select("id")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  dbCheck(error, "Member");
  if (!data) throw new HttpError("Choose an active member", 400);
}

export async function assertSerialFree(admin: Admin, orgId: string, serial: string, exceptId?: string): Promise<void> {
  let q = admin.from("nrs_assets").select("id").eq("org_id", orgId).ilike("serial", likeExact(serial));
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.limit(1);
  dbCheck(error, "Serial check");
  if (data && data.length) throw new HttpError(`Another asset already has serial ${serial}`, 409);
}

/** Escape LIKE wildcards so ilike() is an exact, case-insensitive match. */
export function likeExact(v: string): string {
  return v.replace(/[%_\\]/g, (c) => `\\${c}`);
}
