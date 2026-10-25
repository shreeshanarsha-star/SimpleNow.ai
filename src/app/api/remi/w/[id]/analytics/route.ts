import { handle, requireRemi } from "@/lib/remi/access";
import { findLanguage } from "@/lib/remi/languages";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string }> };

function bump(map: Map<string, number>, key: string | null | undefined, by = 1) {
  const k = (key || "").trim();
  if (!k) return;
  map.set(k, (map.get(k) || 0) + by);
}
const top = (m: Map<string, number>, n = 8) =>
  Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));

// Sales intelligence dashboard: funnel, demand by product/region/language,
// FAQs, objections, follow-ups due, knowledge gaps and safety reports.
// Test-console traffic is excluded.
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, role, user } = await requireRemi(id);
    const days = Math.max(1, Math.min(365, Number(new URL(req.url).searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    let leadsQ = admin
      .from("remi_leads")
      .select("id,name,company,country,location,score,tier,status,deal_value,product_interests,objections,consent,email,phone,callback_requested,follow_up_at,assigned_to,created_at,channel,preferred_language")
      .eq("workspace_id", id)
      .neq("channel", "test")
      .gte("created_at", since)
      .limit(5000);
    if (role === "rep") leadsQ = leadsQ.or(`assigned_to.eq.${user.id},assigned_to.is.null`);

    const [sessionsR, leadsR, msgsR, gapsR, safetyR, followR] = await Promise.all([
      admin.from("remi_sessions").select("id,channel,language,turn_count,started_at").eq("workspace_id", id).neq("channel", "test").gt("turn_count", 0).gte("started_at", since).limit(10000),
      leadsQ,
      admin.from("remi_messages").select("role,topic,language,created_at").eq("workspace_id", id).eq("role", "user").gte("created_at", since).limit(20000),
      admin.from("remi_gaps").select("id,question,language,created_at,status").eq("workspace_id", id).eq("status", "open").order("created_at", { ascending: false }).limit(50),
      admin.from("remi_safety_reports").select("id,description,product,language,status,created_at").eq("workspace_id", id).neq("status", "closed").order("created_at", { ascending: false }).limit(20),
      admin
        .from("remi_leads")
        .select("id,name,company,tier,score,follow_up_at,callback_requested,callback_time,status,assigned_to")
        .eq("workspace_id", id)
        .neq("channel", "test")
        .not("status", "in", "(won,lost)")
        .or("follow_up_at.not.is.null,callback_requested.eq.true")
        .order("follow_up_at", { ascending: true, nullsFirst: false })
        .limit(30),
    ]);

    const sessions = sessionsR.data || [];
    const leads = leadsR.data || [];
    const msgs = msgsR.data || [];

    const qualified = leads.filter((l) => l.consent && (l.email || l.phone));
    const funnel = {
      conversations: sessions.length,
      leads: leads.length,
      qualified: qualified.length,
      meetings: leads.filter((l) => ["meeting", "quoted", "won"].includes(l.status)).length,
      quotations: leads.filter((l) => ["quoted", "won"].includes(l.status)).length,
      orders: leads.filter((l) => l.status === "won").length,
      revenue: leads.filter((l) => l.status === "won").reduce((s, l) => s + (Number(l.deal_value) || 0), 0),
    };

    const tiers = { hot: 0, warm: 0, cold: 0 } as Record<string, number>;
    const products = new Map<string, number>();
    const objections = new Map<string, number>();
    const regions = new Map<string, number>();
    for (const l of leads) {
      tiers[l.tier] = (tiers[l.tier] || 0) + 1;
      (l.product_interests || []).forEach((p: string) => bump(products, p));
      (l.objections || []).forEach((o: string) => bump(objections, o.toLowerCase()));
      bump(regions, l.country || l.location || null);
    }
    const languages = new Map<string, number>();
    sessions.forEach((s) => bump(languages, findLanguage(s.language)?.name || s.language || null));
    const topics = new Map<string, number>();
    msgs.forEach((m) => bump(topics, m.topic ? m.topic.toLowerCase() : null));
    const channels = new Map<string, number>();
    sessions.forEach((s) => bump(channels, s.channel));

    // Daily series for the sparkline.
    const daily = new Map<string, { conversations: number; leads: number }>();
    for (let i = days - 1; i >= 0; i--) {
      daily.set(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10), { conversations: 0, leads: 0 });
    }
    sessions.forEach((s) => {
      const d = daily.get(s.started_at.slice(0, 10));
      if (d) d.conversations++;
    });
    leads.forEach((l) => {
      const d = daily.get(l.created_at.slice(0, 10));
      if (d) d.leads++;
    });

    const hotLeads = leads
      .filter((l) => !["won", "lost"].includes(l.status))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((l) => ({ id: l.id, name: l.name, company: l.company, score: l.score, tier: l.tier, country: l.country, status: l.status, product_interests: l.product_interests }));

    const followUps = (followR.data || []).filter((l) => role !== "rep" || !l.assigned_to || l.assigned_to === user.id);

    return Response.json({
      days,
      funnel,
      tiers,
      avgTurns: sessions.length ? Math.round((sessions.reduce((s, x) => s + x.turn_count, 0) / sessions.length) * 10) / 10 : 0,
      topProducts: top(products),
      topObjections: top(objections, 6),
      topRegions: top(regions),
      topLanguages: top(languages),
      topTopics: top(topics, 10),
      channels: top(channels, 5),
      daily: Array.from(daily.entries()).map(([date, v]) => ({ date, ...v })),
      hotLeads,
      followUps,
      gaps: gapsR.data || [],
      safety: role === "rep" ? [] : safetyR.data || [],
    });
  });
}
