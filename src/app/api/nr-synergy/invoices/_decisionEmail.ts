import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

// Email-only notice to the requester about an approval outcome for leave,
// expenses and invoices. The approvals engine (approvals.ts) already writes
// the in-app notification for these kinds, so this never inserts one: it
// only adds the email, so nothing is duplicated.
//
// Call after createRequest() (covers auto-approval) and after decide() in
// /api/nr-synergy/approvals/decide:  await emailRequesterOutcome(admin, result.requestId);
// Best-effort: never throws.

type Kind = "leave" | "expense" | "invoice";

const KINDS: readonly string[] = ["leave", "expense", "invoice"];
const LINK: Record<Kind, string> = {
  leave: "/tools/nr-synergy/time",
  expense: "/tools/nr-synergy/money",
  invoice: "/tools/nr-synergy/money",
};
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.simplenow.ai";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function html(title: string, body: string, link: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2a24">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2f7a55;margin:0 0 8px">NR Synergy</p>
  <h2 style="font-size:18px;margin:0 0 12px">${esc(title)}</h2>
  <p style="font-size:14px;line-height:1.5;margin:0 0 20px">${esc(body)}</p>
  <a href="${esc(`${SITE}${link}`)}" style="display:inline-block;background:#2f7a55;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Open in NR Synergy</a>
</div>`;
}

interface RequestRow {
  id: string;
  org_id: string;
  kind: string;
  member_id: string;
  title: string;
  status: string;
}

interface StepRow {
  status: string;
  comment: string | null;
  decided_by_member: string | null;
  decided_at: string | null;
}

export async function emailRequesterOutcome(admin: SupabaseClient, requestId: string): Promise<void> {
  try {
    const { data: rData } = await admin
      .from("nrs_requests")
      .select("id, org_id, kind, member_id, title, status")
      .eq("id", requestId)
      .maybeSingle();
    const req = rData as RequestRow | null;
    if (!req || !KINDS.includes(req.kind)) return;
    const kind = req.kind as Kind;

    const { data: sData } = await admin
      .from("nrs_request_steps")
      .select("status, comment, decided_by_member, decided_at")
      .eq("request_id", req.id)
      .in("status", ["approved", "rejected", "sent_back"])
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const step = ((sData ?? []) as StepRow[])[0] ?? null;

    let by = "your approver";
    if (step?.decided_by_member) {
      const { data: dm } = await admin.from("nrs_members").select("full_name").eq("id", step.decided_by_member).maybeSingle();
      by = (dm as { full_name: string } | null)?.full_name ?? by;
    }
    const note = step?.comment?.trim();

    let title: string;
    let body: string;
    if (req.status === "approved") {
      title = `Approved: ${req.title}`;
      body = step ? (note ? `${by}: ${note}` : `Approved by ${by}.`) : "Approved automatically.";
    } else if (req.status === "rejected" || req.status === "sent_back") {
      title = `${req.status === "rejected" ? "Rejected" : "Sent back"}: ${req.title}`;
      body = note ? `${by}: ${note}` : `Decided by ${by}.`;
    } else if (req.status === "pending" && kind === "invoice" && step?.status === "approved") {
      // An invoice stage was approved and it moved to the next approver.
      title = `Invoice update: ${req.title}`;
      body = `Approved by ${by}${note ? ` (${note})` : ""}. It has moved to the next approval stage.`;
    } else {
      return;
    }

    const { data: mData } = await admin
      .from("nrs_members")
      .select("email")
      .eq("id", req.member_id)
      .eq("org_id", req.org_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    const to = (mData as { email: string | null } | null)?.email;
    if (!to) return;
    await sendEmail({ to, subject: `NR Synergy: ${title}`, html: html(title, body, LINK[kind]), tool: "NR Synergy" });
  } catch (e) {
    console.error("[nrs] requester outcome email failed", e);
  }
}
