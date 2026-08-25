import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { sendEmail } from "@/lib/email";

const FEATURE_KEY = "Smart Source.ai";

type CandidateInput = {
  name: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  match_score: number | null;
  profile_url: string;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const candidates: CandidateInput[] = Array.isArray(body?.candidates) ? body.candidates : [];
  const roleTitle = typeof body?.roleTitle === "string" ? body.roleTitle : "";

  if (!to) return NextResponse.json({ error: "Add a recipient email address." }, { status: 400 });
  if (!candidates.length) return NextResponse.json({ error: "Select at least one candidate first." }, { status: 400 });

  const rows = candidates
    .map(
      (c) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.name || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${c.match_score ?? "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.company || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.location || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;"><a href="${escapeHtml(c.profile_url)}">View profile</a></td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;color:#211f1a;">
      <h2>Smart Source.ai${roleTitle ? ` — ${escapeHtml(roleTitle)}` : ""}</h2>
      <p>${candidates.length} candidate(s) shared from Askshree.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="text-align:left;">
          <th style="padding:8px;border-bottom:2px solid #ccc;">Name</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Score</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Company</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Location</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Profile</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const result = await sendEmail({ to, subject: `Smart Source.ai candidates${roleTitle ? ` — ${roleTitle}` : ""}`, html });
  if (!result.ok) return NextResponse.json({ error: result.error || "Could not send the email." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
