import { clean, cleanList } from "./access";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : null;
}

export function productInput(b: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("name")) out.name = clean(b.name, 160);
  if (has("sku")) out.sku = clean(b.sku, 60);
  if (has("category")) out.category = clean(b.category, 100);
  if (has("summary")) out.summary = clean(b.summary, 1200);
  if (has("key_benefits")) out.key_benefits = cleanList(b.key_benefits, 10, 200);
  if (has("species")) out.species = cleanList(b.species, 20, 60);
  if (has("applications")) out.applications = cleanList(b.applications, 15, 100);
  if (has("dosage")) out.dosage = clean(b.dosage, 800);
  if (has("pack_sizes")) out.pack_sizes = clean(b.pack_sizes, 200);
  if (has("price_min")) out.price_min = num(b.price_min);
  if (has("price_max")) out.price_max = num(b.price_max);
  if (has("currency")) out.currency = (clean(b.currency, 8) || "INR").toUpperCase();
  if (has("price_unit")) out.price_unit = clean(b.price_unit, 40);
  if (has("countries")) out.countries = cleanList(b.countries, 80, 60);
  if (has("active") && "active" in b) out.active = !!b.active;
  if (has("sort") && "sort" in b) out.sort = Math.round(Number(b.sort) || 0);
  if (out.price_min != null && out.price_max != null && (out.price_min as number) > (out.price_max as number)) {
    [out.price_min, out.price_max] = [out.price_max, out.price_min];
  }
  return out;
}
