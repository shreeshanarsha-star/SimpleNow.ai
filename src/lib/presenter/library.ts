// Presenter.ai — Shree's Library: documents, links and notes Shree can look up live.
// Text is split into chunks, embedded (OpenAI text-embedding-3-small) and searched with pgvector.
import { createHash } from "crypto";
import { db } from "@/lib/presenter/server";

const EMBED_MODEL = "text-embedding-3-small";
const CHUNK = 1200;
const OVERLAP = 150;

export async function embed(texts: string[], timeoutMs = 20_000): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as { data?: Array<{ embedding: number[] }>; error?: { message?: string } } | null;
    if (!res.ok || !data?.data) throw new Error(data?.error?.message || `Embedding error (${res.status})`);
    return data.data.map((d) => d.embedding);
  } finally {
    clearTimeout(t);
  }
}

export function cleanText(t: string) {
  return t.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Paragraph-aware chunks of ~1,200 characters with a small overlap. */
export function chunkText(text: string): string[] {
  const paras = cleanText(text).split(/\n\s*\n/);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = cur.slice(-OVERLAP);
  };
  for (const p of paras) {
    if (p.length > CHUNK) {
      if (cur.trim()) push();
      for (let i = 0; i < p.length; i += CHUNK - OVERLAP) out.push(p.slice(i, i + CHUNK).trim());
      cur = "";
      continue;
    }
    if (cur.length + p.length + 2 > CHUNK) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((c) => c.length > 20);
}

async function storeChunks(docId: string, chunks: string[]) {
  const sb = db();
  for (let i = 0; i < chunks.length; i += 64) {
    const batch = chunks.slice(i, i + 64);
    const vecs = await embed(batch);
    const rows = batch.map((content, j) => ({ doc_id: docId, idx: i + j, content, embedding: JSON.stringify(vecs[j]) }));
    const { error } = await sb.from("presenter_library_chunks").insert(rows);
    if (error) throw new Error(error.message);
  }
}

/** Add a document from plain text. Fails cleanly (status "failed") instead of throwing. */
export async function addDoc(d: { title: string; kind: string; source?: string | null; text: string }) {
  const sb = db();
  const text = cleanText(d.text).slice(0, 400_000);
  const { data: doc, error } = await sb
    .from("presenter_library")
    .insert({ title: d.title.slice(0, 200), kind: d.kind, source: d.source?.slice(0, 500) || null, status: "ready", chars: text.length })
    .select("id")
    .single();
  if (error || !doc) throw new Error(error?.message || "Could not save");
  try {
    if (text.length < 40) throw new Error("Not enough readable text");
    await storeChunks(doc.id, chunkText(text));
  } catch (e) {
    await sb.from("presenter_library").update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Failed" }).eq("id", doc.id);
    await sb.from("presenter_library_chunks").delete().eq("doc_id", doc.id);
    return { id: doc.id, status: "failed", error: e instanceof Error ? e.message : "Failed" };
  }
  return { id: doc.id, status: "ready", chars: text.length };
}

/** Read a web page once, server-side, and turn it into plain text. */
export async function fetchUrlText(url: string): Promise<{ title: string; text: string }> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SimpleNow-Presenter/1.0)", Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`The site returned ${res.status}`);
    const type = res.headers.get("content-type") || "";
    if (type.includes("pdf")) throw new Error("This link is a PDF: download it and upload the file instead");
    const raw = (await res.text()).slice(0, 2_000_000);
    if (!type.includes("html")) return { title: u.hostname, text: raw };
    const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || u.hostname).replace(/\s+/g, " ").trim();
    const body = raw
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&mdash;|&ndash;/g, "-")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, " ");
    return { title: decodeURIComponent(title).slice(0, 200), text: body };
  } finally {
    clearTimeout(t);
  }
}

/** Keep the deck (every slide + speaker notes) in the Library; rebuilt only when the text changes. */
export async function syncDeck(sessionId: string) {
  const sb = db();
  const { data: rows } = await sb.from("presenter_slides").select("idx, body, notes").eq("session_id", sessionId).order("idx");
  if (!rows?.length) return { skipped: true };
  const parts = rows.map((r) => `Slide ${r.idx + 1}\n${cleanText(String(r.body || ""))}\nSpeaker notes: ${cleanText(String(r.notes || ""))}`);
  const hash = createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
  const source = `deck:${sessionId}:${hash}`;
  const { data: existing } = await sb.from("presenter_library").select("id, source").eq("kind", "deck");
  if (existing?.some((e) => e.source === source)) return { unchanged: true };
  const sbIds = (existing || []).map((e) => e.id);
  if (sbIds.length) await sb.from("presenter_library").delete().in("id", sbIds);
  const { data: doc, error } = await sb
    .from("presenter_library")
    .insert({ title: "The Rise of AI Agents: slides and speaker notes", kind: "deck", source, status: "ready", chars: parts.join("").length })
    .select("id")
    .single();
  if (error || !doc) throw new Error(error?.message || "Could not save deck");
  await storeChunks(doc.id, parts.map((p) => p.slice(0, 6000)));
  return { slides: rows.length };
}

/** Most relevant passages for what was just said. Never throws: returns "" on any problem. */
export async function searchLibrary(query: string, n = 6) {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 1500);
  if (q.length < 8) return "";
  try {
    const [vec] = await embed([q], 4000);
    const { data } = await db().rpc("presenter_library_match", { query_embedding: JSON.stringify(vec), match_count: n });
    const hits = ((data || []) as Array<{ title: string; content: string; similarity: number }>).filter((h) => h.similarity > 0.25);
    let out = "";
    for (const h of hits) {
      const piece = `[${h.title}]\n${h.content}\n\n`;
      if (out.length + piece.length > 5000) break;
      out += piece;
    }
    return out.trim();
  } catch {
    return "";
  }
}
