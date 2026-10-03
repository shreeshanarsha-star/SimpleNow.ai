// Shared NR Synergy notifications: in-app (platform `notifications` table) + email (Resend via sendEmail).
// Best-effort by design: a failed notification never blocks the business action that triggered it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { NRS_FEATURE_KEY } from "@/lib/nrs/member";

export interface NrsNotice {
  title: string;
  body?: string;
  /** Path inside the app, e.g. /tools/nr-synergy/team?tab=approvals */
  link: string;
  /** Also send an email (default true). */
  email?: boolean;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.simplenow.ai";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function emailHtml(n: NrsNotice): string {
  const url = n.link.startsWith("http") ? n.link : `${SITE}${n.link}`;
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2a24">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2f7a55;margin:0 0 8px">NR Synergy</p>
  <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(n.title)}</h2>
  ${n.body ? `<p style="font-size:14px;line-height:1.5;margin:0 0 20px">${escapeHtml(n.body)}</p>` : ""}
  <a href="${escapeHtml(url)}" style="display:inline-block;background:#2f7a55;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Open in NR Synergy</a>
</div>`;
}

/** Notify NR Synergy members (by nrs_members.id) in one org. Uses the service-role client. */
export async function notifyMembers(admin: SupabaseClient, orgId: string, memberIds: string[], n: NrsNotice): Promise<void> {
  const ids = Array.from(new Set(memberIds.filter(Boolean)));
  if (!ids.length) return;
  try {
    const { data } = await admin
      .from("nrs_members")
      .select("user_id, email")
      .eq("org_id", orgId)
      .in("id", ids)
      .eq("status", "active")
      .is("deleted_at", null);
    const rows = (data ?? []) as { user_id: string | null; email: string | null }[];
    const userIds = rows.map((r) => r.user_id).filter((u): u is string => !!u);
    if (userIds.length) {
      const { error } = await admin.from("notifications").insert(
        userIds.map((userId) => ({
          user_id: userId,
          org_id: orgId,
          feature_key: NRS_FEATURE_KEY,
          title: n.title,
          body: n.body ?? null,
          link: n.link,
          channel: "in_app",
        }))
      );
      if (error) console.error("[nrs] notification insert failed", error.message);
    }
    if (n.email !== false) {
      await Promise.all(
        rows
          .map((r) => r.email)
          .filter((e): e is string => !!e)
          .map((to) => sendEmail({ to, subject: `NR Synergy: ${n.title}`, html: emailHtml(n), tool: "NR Synergy" }))
      );
    }
  } catch (e) {
    console.error("[nrs] notifyMembers failed", e);
  }
}

/** Notify everyone in the org holding any of the given roles (super_admin always included for hr_admin). */
export async function notifyRoles(admin: SupabaseClient, orgId: string, roles: string[], n: NrsNotice): Promise<void> {
  try {
    const wanted = roles.includes("hr_admin") ? [...roles, "super_admin"] : roles;
    const { data } = await admin
      .from("nrs_member_roles")
      .select("member_id, nrs_members!inner(org_id)")
      .in("role", wanted)
      .eq("nrs_members.org_id", orgId);
    const ids = ((data ?? []) as { member_id: string }[]).map((r) => r.member_id);
    await notifyMembers(admin, orgId, ids, n);
  } catch (e) {
    console.error("[nrs] notifyRoles failed", e);
  }
}
