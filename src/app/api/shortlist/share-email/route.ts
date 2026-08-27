import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { sendEmail } from "@/lib/email";

// Professional candidate summary email -- same Resend-based pattern as
// Smart Source.ai's share-email route, scoped to the signed-in user
// (Personal Tool, not feature-gated). Never sends without the recruiter
// explicitly calling this from a confirmed Share action.
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

type CandidateInput = {
  name: string | null;
  current_company: string | null;
  location: string | null;
  overall_score: number | null;
  qualification: string | null;
  notice_period: string | null;
};

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const candidates: CandidateInput[] = Array.isArray(body?.candidates) ? body.candidates : [];
  const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle : "";

  if (!to) return NextResponse.json({ error: "Add a recipient email address." }, { status: 400 });
  if (!candidates.length) return NextResponse.json({ error: "Select at least one candidate first." }, { status: 400 });

  const rows = candidates
    .map(
      (c) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.name || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${c.overall_score ?? "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.current_company || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.location || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.qualification || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.notice_period || "—")}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;color:#211f1a;">
      <h2>Shortlist.ai${jobTitle ? ` — ${escapeHtml(jobTitle)}` : ""}</h2>
      <p>${candidates.length} candidate(s) shared from Askshree.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="text-align:left;">
          <th style="padding:8px;border-bottom:2px solid #ccc;">Name</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Score</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Company</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Location</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Qualification</th>
          <th style="padding:8px;border-bottom:2px solid #ccc;">Notice period</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const result = await sendEmail({ to, subject: `Shortlist.ai candidates${jobTitle ? ` — ${jobTitle}` : ""}`, html });
  if (!result.ok) return NextResponse.json({ error: result.error || "Could not send the email." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
