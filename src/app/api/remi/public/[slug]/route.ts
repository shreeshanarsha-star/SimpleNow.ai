import { loadWorkspaceBySlug, json } from "@/lib/remi/public";

export const dynamic = "force-dynamic";

// Public profile for the customer-facing page: branding, greeting and the
// product shelf. Never returns prices when pricing is hidden, and never
// returns internal settings (emails, webhook, etc.).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadWorkspaceBySlug(slug);
  if (!found) return json({ error: "This assistant isn't available." }, 404);
  const { admin, ws } = found;
  const { data: products } = await admin
    .from("remi_products")
    .select("id,name,category,summary,key_benefits,species,applications,pack_sizes,price_min,price_max,currency,price_unit")
    .eq("workspace_id", ws.id)
    .eq("active", true)
    .order("sort", { ascending: true })
    .limit(60);
  return json({
    workspace: {
      slug: ws.slug,
      name: ws.name,
      assistant_name: ws.assistant_name,
      tagline: ws.tagline,
      industry: ws.industry,
      about: ws.about,
      greeting: ws.greeting,
      default_language: ws.default_language,
      voice: ws.voice,
      kiosk_idle_seconds: ws.kiosk_idle_seconds,
      suggested_questions: ws.suggested_questions || [],
      consent_text: ws.consent_text,
    },
    products: (products || []).map((p) =>
      ws.pricing_mode === "range" || ws.pricing_mode === "exact" ? p : { ...p, price_min: null, price_max: null }
    ),
  });
}
