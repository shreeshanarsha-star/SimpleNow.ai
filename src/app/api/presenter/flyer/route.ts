// Presenter.ai — live flyer build (owner only). Streams the generated HTML
// back to the TV as it is written and saves the finished app to storage.
// It never blocks Presenter: the TV consumes it in the background.
import Anthropic from "@anthropic-ai/sdk";
import { db, json, ownerGuard } from "@/lib/presenter/server";
import { patchHub, sessionById } from "@/lib/presenter/hub";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Inputs = { name: string; date: string; venue: string; highlights: string[] };

function instruction(i: Inputs) {
  return `Build a fully working, mobile-first web app called "Natural Remedies Flyer Studio".

Goal: let an NRPL employee create a professional internal event flyer by entering a few details, choosing a design, and downloading or sharing the finished flyer.

1. Input form, PREFILLED with these details so it can be shown immediately:
- Event name (required): ${i.name}
- Date and time (required): ${i.date}
- Venue (required): ${i.venue}
- Three highlights (required): ${i.highlights.map((h, n) => `(${n + 1}) ${h}`).join(" ")}
- Organiser (optional)
- Logo upload (optional)

2. Branding
- Natural Remedies colours: blue #0066B3, green #6AA132, orange #F26522, yellow #FBB116, on a white background.
- Roboto font (Google Fonts), with a clean sans-serif fallback.
- Use the uploaded logo, on white only. Never draw or recreate the logo; if none is uploaded, show the text "Natural Remedies".
- Good contrast; all text readable.

3. Three layouts, selectable, and the preview updates instantly: Corporate (clean, formal, structured), Celebration (colourful and energetic), Minimal (generous white space).

4. Live preview: portrait 4:5, updates as the user types. Long names and highlights must shrink or wrap, never overflow or disappear. Render the flyer on a <canvas> of 1080 x 1350 so the preview and the download are identical.

5. Buttons: Download PNG, Share, Reset.
- Download PNG creates a real 1080 x 1350 image of the flyer.
- Share uses navigator.share with the image file where supported. Otherwise, download the PNG and open https://wa.me/?text=... with a ready message, telling the user to attach the image.

6. Technical
- Works on Android and iPhone browsers; touch targets at least 44 px; no horizontal scrolling at 360 px width.
- No login, backend, database, payments or external APIs (Google Fonts is the only allowed external request). Nothing stored.
- Validate required fields with clear error messages.

QUALITY BAR (this is shown live to an audience):
- The flyer must look professionally designed and FILL the 1080 x 1350 canvas: event name at 80 to 110 px bold, details at 40 to 50 px, highlights at 36 to 44 px, coloured bands or shapes in the brand colours, generous margins (80 px). Never leave the lower half empty.
- Each of the 3 layouts must look clearly different.
- Wait for the Roboto font to load (document.fonts.load) before drawing; redraw on every input.
- Style the form too: rounded inputs at least 44 px tall, 16 px text, brand-blue primary buttons, layout chosen with 3 large toggle buttons, three separate highlight inputs.

OUTPUT FORMAT: reply with ONE complete, self-contained HTML document (inline CSS and JS), starting with <!doctype html> and ending with </html>. No explanation, no markdown fences. Prioritise working buttons over decoration.`;
}

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
