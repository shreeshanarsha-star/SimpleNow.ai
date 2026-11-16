// Presenter.ai — live flyer build (owner only). Streams the generated HTML
// back to the TV as it is written and saves the finished app to storage.
// It never blocks Presenter: the TV consumes it in the background.
import Anthropic from "@anthropic-ai/sdk";
import { db, json, ownerGuard } from "@/lib/presenter/server";
import { patchHub, sessionById } from "@/lib/presenter/hub";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { flyerInstruction as instruction, type FlyerBriefInputs as Inputs } from "@/lib/presenter/flyerBrief";

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as { id?: string; inputs?: Partial<Inputs> };
  const session = await sessionById(String(body.id || ""));
  if (!session) return json({ error: "Session not found" }, 404);
  const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const inputs: Inputs = {
    name: clip(body.inputs?.name, 80),
    date: clip(body.inputs?.date, 60),
    venue: clip(body.inputs?.venue, 70),
    highlights: (body.inputs?.highlights || []).map((h) => clip(h, 70)).filter(Boolean).slice(0, 3),
  };
  if (!inputs.name || !inputs.date || !inputs.venue || inputs.highlights.length < 3) return json({ error: "Need event name, date, venue and 3 highlights" }, 400);

  const startedAt = Date.now();
  await patchHub(session.id, { flyerBuild: { status: "building", startedAt, inputs } });
  const prompt = instruction(inputs);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let html = "";
      let provider = "";
      const push = (t: string) => {
        html += t;
        controller.enqueue(enc.encode(t));
      };
      try {
        let done = false;
        if (process.env.ANTHROPIC_API_KEY) {
          try {
            const client = new Anthropic({
              apiKey: process.env.ANTHROPIC_API_KEY,
              defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
            });
            const s = client.messages.stream({
              model: process.env.PRESENTER_BUILD_MODEL_CLAUDE || process.env.PRESENTER_MODEL || "claude-sonnet-4-5",
              max_tokens: 16000,
              messages: [{ role: "user", content: prompt }],
            });
            s.on("text", (t) => push(t));
            await s.finalMessage();
            provider = "claude";
            done = html.length > 500;
          } catch (err) {
            console.error("[flyer] Claude failed, falling back:", err instanceof Error ? err.message : err);
            html = "";
          }
        }
        if (!done) {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({
              model: process.env.PRESENTER_BUILD_MODEL || "gpt-4o",
              max_tokens: 14000,
              stream: true,
              messages: [{ role: "user", content: prompt }],
            }),
          });
          if (!res.ok || !res.body) throw new Error(`OpenAI error ${res.status}`);
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done: end } = await reader.read();
            if (end) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const l = line.trim();
              if (!l.startsWith("data:")) continue;
              const d = l.slice(5).trim();
              if (d === "[DONE]") continue;
              try {
                const t = JSON.parse(d)?.choices?.[0]?.delta?.content;
                if (t) push(t);
              } catch {}
            }
          }
          provider = "openai";
        }
        // Keep just the HTML document.
        const m = html.match(/<!doctype html[\s\S]*<\/html>/i) || html.match(/<html[\s\S]*<\/html>/i);
        if (!m) throw new Error("The build did not produce a complete HTML page");
        const page = m[0];
        const { error } = await db().storage.from("presenter").upload(`${session.id}/flyer.html`, Buffer.from(page), { contentType: "text/html", upsert: true });
        if (error) throw new Error(error.message);
        await patchHub(session.id, { flyerBuild: { status: "ready", startedAt, finishedAt: Date.now(), inputs, provider } });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Build failed";
        await patchHub(session.id, { flyerBuild: { status: "failed", startedAt, finishedAt: Date.now(), inputs, error: msg } }).catch(() => {});
        controller.enqueue(enc.encode(`\n\n[BUILD FAILED: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
