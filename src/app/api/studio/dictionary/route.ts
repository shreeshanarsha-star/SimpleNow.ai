import { getDictionary, json, ownerGuard, saveDictionary } from "@/lib/presenter/server";
import { studioGuard } from "@/lib/studio/server";

export const dynamic = "force-dynamic";

// GET: the presenter's pronunciation dictionary. POST { add: [{text, pronunciation}] }: add/replace entries.
export async function GET(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  try {
    return json(await getDictionary());
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Could not read the dictionary" }, 502);
  }
}

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const b = (await req.json().catch(() => ({}))) as { add?: Array<{ text: string; pronunciation: string }> };
  const add = (b.add || [])
    .map((e) => ({ text: String(e.text || "").replace(/[[\]]/g, "").trim().slice(0, 100), pronunciation: String(e.pronunciation || "").replace(/[[\]<>]/g, "").trim().slice(0, 200) }))
    .filter((e) => e.text && e.pronunciation);
  if (!add.length) return json({ error: "Nothing to add" }, 400);
  try {
    const cur = await getDictionary();
    const key = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
    const keep = cur.entries.filter((e) => !add.some((a) => key(a.text) === key(e.text)));
    const saved = await saveDictionary([...keep, ...add.map((a) => ({ ...a, kind: "sounds_like" }))], cur.revision);
    return json(saved);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Could not save" }, 502);
  }
}
