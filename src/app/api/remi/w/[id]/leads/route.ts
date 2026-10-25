import { handle, requireRemi } from "@/lib/remi/access";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string }> };

const COLS =
  "id,session_id,name,company,designation,email,phone,location,country,preferred_language,customer_type,product_interests,requirements,budget,timeline,purchase_authority,score,tier,objections,next_best_action,summary,consent,callback_requested,callback_time,status,deal_value,assigned_to,follow_up_at,channel,created_at,updated_at";

function csvCell(v: unknown) {
  const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

// Reps see leads assigned to them plus unassigned ones; admins/owners/viewers see all.
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, role, user } = await requireRemi(id);
    const url = new URL(req.url);
    const tier = url.searchParams.get("tier");
    const status = url.searchParams.get("status");
    const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
    const mine = url.searchParams.get("mine") === "1";
    const includeTest = url.searchParams.get("test") === "1";

    let query = admin.from("remi_leads").select(COLS).eq("workspace_id", id).order("created_at", { ascending: false }).limit(1000);
    if (tier && ["hot", "warm", "cold"].includes(tier)) query = query.eq("tier", tier);
    if (status && ["new", "contacted", "meeting", "quoted", "won", "lost"].includes(status)) query = query.eq("status", status);
    if (!includeTest) query = query.neq("channel", "test");
    if (role === "rep") query = query.or(`assigned_to.eq.${user.id},assigned_to.is.null`);
    if (mine) query = query.eq("assigned_to", user.id);
    if (q) {
      const like = `%${q.replace(/[%_,()]/g, " ")}%`;
      query = query.or(`name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like},country.ilike.${like},requirements.ilike.${like}`);
    }
    const { data } = await query;
    const leads = data || [];

    if (url.searchParams.get("format") === "csv") {
      const headers = COLS.split(",");
      const lines = [headers.join(","), ...leads.map((l) => headers.map((h) => csvCell((l as Record<string, unknown>)[h])).join(","))];
      return new Response("﻿" + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dr-remi-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    return Response.json({ leads });
  });
}
