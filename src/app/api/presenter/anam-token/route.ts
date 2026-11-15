import { json, mintAnamToken, ownerGuard } from "@/lib/presenter/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  try {
    const sessionToken = await mintAnamToken();
    return json({ sessionToken });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Anam token failed" }, 502);
  }
}

// Owner-only diagnostic: shape of the Anam persona response (no secrets).
export async function GET() {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const key = process.env.ANAM_API_KEY;
  if (!key) return json({ error: "no key" });
  const id = process.env.ANAM_PERSONA_ID || "41f8a8e5-65f8-4485-b2cf-735affc15477";
  const out: Record<string, unknown> = {};
  for (const path of [`/personas/${id}`, `/personas?perPage=100`]) {
    const r = await fetch(`https://api.anam.ai/v1${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const body = await r.json().catch(() => null);
    const shape = (v: unknown, d = 0): unknown =>
      d > 2 || v === null || typeof v !== "object"
        ? typeof v === "string" ? `str(${(v as string).length})${/^[0-9a-f-]{36}$/.test(v as string) ? ":uuid" : ""}` : typeof v
        : Array.isArray(v) ? [v.length, v.length ? shape(v[0], d + 1) : null] : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, d + 1)]));
    out[path] = { status: r.status, shape: shape(body) };
  }
  return json(out);
}
