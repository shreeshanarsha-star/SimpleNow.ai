// Presenter.ai — autopilot listening helpers: pull structured answers out of
// what the room says (flyer inputs, the agent-demo outcome).
import { callTextModel } from "@/lib/aiClient";
import { json, ownerGuard } from "@/lib/presenter/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const model = () => process.env.PRESENTER_FALLBACK_MODEL || "gpt-4o";
const parse = (out: string) => JSON.parse(out.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as { kind?: string; heard?: string; current?: Record<string, unknown>; options?: string[] };
  const heard = String(body.heard || "").slice(0, 800);
  try {
    if (body.kind === "flyer") {
      const cur = body.current || {};
      const out = await callTextModel(
        `People in a meeting are suggesting details for an internal event flyer. Current details: ${JSON.stringify(cur)}.
They just said (speech-to-text, may contain errors): "${heard}"
Update the details with anything new. Fields: name (event name), date (date and time), venue, highlights (array of up to 3 short items). Keep existing values unless clearly replaced. Don't invent anything that wasn't said.
Return ONLY JSON: {"name":string|null,"date":string|null,"venue":string|null,"highlights":string[]}`,
        200,
        12_000,
        model()
      );
      const p = parse(out);
      return json({
        inputs: {
          name: p.name || cur.name || null,
          date: p.date || cur.date || null,
          venue: p.venue || cur.venue || null,
          highlights: (Array.isArray(p.highlights) && p.highlights.length ? p.highlights : (cur.highlights as string[]) || []).slice(0, 3),
        },
      });
    }
    if (body.kind === "choice") {
      const options = (body.options || []).slice(0, 6);
      const out = await callTextModel(
        `Someone just said (speech-to-text): "${heard}". Which ONE of these outcomes are they describing? ${options.map((o, i) => `${i}: ${o}`).join("; ")}.
Return ONLY JSON: {"index": number or null if it's not clearly one of them}`,
        30,
        10_000,
        model()
      );
      const p = parse(out);
      const idx = typeof p.index === "number" && p.index >= 0 && p.index < options.length ? p.index : null;
      return json({ index: idx });
    }
  } catch {
    return json({ error: "Could not understand" }, 200);
  }
  return json({ error: "Unknown kind" }, 400);
}
