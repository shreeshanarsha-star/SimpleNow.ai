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
