import { canUse, db, getShow, json, studioGuard } from "@/lib/studio/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST: a signed upload URL (the browser uploads the PDF straight to storage; no 4.5 MB limit).
export async function POST(req: Request, ctx: Ctx) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  if (!canUse(await getShow(id), g)) return json({ error: "Not found" }, 404);
  const { data, error } = await db().storage.from("presenter").createSignedUploadUrl(`shows/${id}/deck.pdf`, { upsert: true });
  if (error || !data) return json({ error: error?.message || "Could not prepare the upload" }, 500);
  return json({ signedUrl: data.signedUrl });
}

// GET: a signed download URL for the deck (6 hours).
export async function GET(req: Request, ctx: Ctx) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  if (!canUse(await getShow(id), g)) return json({ error: "Not found" }, 404);
  const { data } = await db().storage.from("presenter").createSignedUrl(`shows/${id}/deck.pdf`, 60 * 60 * 6);
  return json({ url: data?.signedUrl || null });
}
