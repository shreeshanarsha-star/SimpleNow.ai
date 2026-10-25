import { handle, requireRemi, jsonError } from "@/lib/remi/access";
import { chatJson, hasRemiAi } from "@/lib/remi/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

// Continuous improvement: reads the last 90 days of objections, unanswered
// questions, demand and conversion, and recommends concrete changes to
// messaging, positioning, content (Brains) and market focus.
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id, "admin");
    if (!hasRemiAi()) return jsonError("AI is not configured on the server.", 503);
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    const [{ data: ws }, { data: leads }, { data: gaps }, { data: topics }] = await Promise.all([
      admin.from("remi_workspaces").select("name,industry,about").eq("id", id).single(),
      admin.from("remi_leads").select("tier,status,country,customer_type,product_interests,objections,timeline,budget,deal_value").eq("workspace_id", id).neq("channel", "test").gte("created_at", since).limit(1500),
      admin.from("remi_gaps").select("question").eq("workspace_id", id).gte("created_at", since).limit(200),
      admin.from("remi_messages").select("topic").eq("workspace_id", id).eq("role", "user").gte("created_at", since).limit(5000),
    ]);
    if (!leads?.length && !gaps?.length) return jsonError("Not enough conversations yet — come back after a few customer chats.", 400);
    const topicCounts: Record<string, number> = {};
    (topics || []).forEach((t) => t.topic && (topicCounts[t.topic.toLowerCase()] = (topicCounts[t.topic.toLowerCase()] || 0) + 1));

    const out = await chatJson(
      [
        {
          role: "system",
          content: `You are a sales strategy and product-marketing advisor for ${ws?.name} (${ws?.industry || "B2B"}). Analyse the aggregated sales-assistant data and recommend improvements. Be specific and evidence-based; quote counts. Reply JSON:
{"headline": "one-sentence diagnosis",
 "conversion": "where the funnel leaks and why (<=60 words)",
 "messaging": [3-5 concrete changes to sales messaging / answers],
 "positioning": [2-4 product positioning recommendations],
 "content_gaps": [up to 6 Brains (documents/FAQs/studies) to add, each with why],
 "objection_playbook": [{"objection": "", "best_response": ""}],
 "market_focus": [2-4 regions/segments/customer types to prioritise and why],
 "unmet_needs": [up to 4 product or service opportunities customers are asking for]}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            leads: leads?.slice(0, 600),
            unanswered_questions: (gaps || []).map((g) => g.question).slice(0, 150),
            question_topics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 40),
          }).slice(0, 60000),
        },
      ],
      { maxTokens: 2000, temperature: 0.3, timeoutMs: 55_000 }
    );
    return Response.json({ insights: out, generated_at: new Date().toISOString() });
  });
}
