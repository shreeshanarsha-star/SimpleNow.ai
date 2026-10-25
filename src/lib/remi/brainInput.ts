import { clean, cleanList } from "./access";
import { BRAIN_KINDS, EVIDENCE_TYPES } from "./ingest";

/** Shared validation of the editable Brain metadata fields. */
export function brainMeta(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if ("title" in b) out.title = clean(b.title, 200);
  if ("kind" in b && BRAIN_KINDS.includes(String(b.kind))) out.kind = b.kind;
  if ("evidence_type" in b) out.evidence_type = EVIDENCE_TYPES.includes(String(b.evidence_type)) ? b.evidence_type : null;
  if ("visibility" in b) out.visibility = b.visibility === "internal" ? "internal" : "public";
  if ("countries" in b) out.countries = cleanList(b.countries, 60, 60);
  if ("species" in b) out.species = cleanList(b.species, 30, 60);
  if ("tags" in b) out.tags = cleanList(b.tags, 30, 60);
  if ("priority" in b) out.priority = Math.max(0, Math.min(5, Math.round(Number(b.priority) || 0)));
  if ("expires_at" in b) {
    const d = typeof b.expires_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expires_at) ? b.expires_at : null;
    out.expires_at = d;
  }
  return out;
}
