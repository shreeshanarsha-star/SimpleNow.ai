import { db, json, ownerGuard } from "@/lib/studio/server";

export const dynamic = "force-dynamic";
// Run next to the database (Supabase is in Singapore): live polling must be fast.
export const preferredRegion = "sin1";

type Ctx = { params: Promise<{ id: string }> };

// POST: a signed upload URL (the browser uploads the PDF straight to storage; no 4.5 MB limit).
export async function POST(_req: Request, ctx: Ctx) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const { data, error } = await db().storage.from("presenter").createSignedUploadUrl(`shows/${id}/deck.pdf`, { upsert: true });
  if (error || !data) return json({ error: error?.message || "Could not prepare the upload" }, 500);
  return json({ signedUrl: data.signedUrl });
}

// GET: a signed download URL for the deck (6 hours).
export async function GET(_req: Request, ctx: Ctx) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const { data } = await db().storage.from("presenter").createSignedUrl(`shows/${id}/deck.pdf`, 60 * 60 * 6);
  return json({ url: data?.signedUrl || null });
}
