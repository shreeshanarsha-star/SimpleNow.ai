import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadWorkspaceBySlug } from "@/lib/remi/public";
import RemiPublicPage from "@/components/tools/remi/RemiPublicPage";
import RemiKiosk from "@/components/tools/remi/RemiKiosk";
import type { RemiPublicProduct, RemiPublicWorkspace } from "@/components/tools/remi/types";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const found = await loadWorkspaceBySlug(slug);
  if (!found) return null;
  const { admin, ws } = found;
  const { data: products } = await admin
    .from("remi_products")
    .select("id,name,category,summary,key_benefits,species,applications,pack_sizes,price_min,price_max,currency,price_unit")
    .eq("workspace_id", ws.id)
    .eq("active", true)
    .order("sort", { ascending: true })
    .limit(60);
  const showPrice = ws.pricing_mode === "range" || ws.pricing_mode === "exact";
  const pub: RemiPublicWorkspace = {
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
    avatar_url: (ws as { avatar_url?: string | null }).avatar_url || null,
  };
  return {
    ws: pub,
    products: ((products || []) as RemiPublicProduct[]).map((p) => (showPrice ? p : { ...p, price_min: null, price_max: null })),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Dr.Remi.ai" };
  return {
    title: `${data.ws.assistant_name} — ${data.ws.name} · 24/7 AI Sales Assistant`,
    description: `Talk to ${data.ws.name}'s AI product expert in any language — product advice, results, availability and quotes, 24/7.`,
    ...(data.ws.avatar_url
      ? {
          openGraph: { images: [{ url: data.ws.avatar_url }], title: `${data.ws.assistant_name} — ${data.ws.name}` },
          icons: { icon: data.ws.avatar_url, apple: data.ws.avatar_url },
        }
      : {}),
  };
}

export default async function RemiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string; src?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await load(slug);
  if (!data) notFound();
  if (sp.mode === "kiosk") return <RemiKiosk ws={data.ws} />;
  return <RemiPublicPage ws={data.ws} products={data.products} channel={sp.src === "qr" ? "qr" : "web"} />;
}
