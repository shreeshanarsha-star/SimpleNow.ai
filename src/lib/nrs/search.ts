// NR Synergy global search: pure helpers shared by GET /api/nr-synergy/search
// (term normalising, LIKE escaping, static matching, grouping) and the
// GlobalSearch client component (match highlighting). No I/O in here, so it
// can be unit-tested with plain node (see ./search.test.ts).

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 80;
export const SEARCH_LIMIT = 5;

export type SearchGroupKey =
  | "actions"
  | "pages"
  | "people"
  | "documents"
  | "projects"
  | "tickets"
  | "posts"
  | "values"
  | "links";

export interface SearchItem {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  /** Opens in a new tab (quick links). */
  external?: boolean;
  /** Optional icon name (pages / actions carry their own). */
  icon?: string;
}

export interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  items: SearchItem[];
}

export interface SearchResponse {
  groups: SearchGroup[];
}

/** Display order of groups in the dropdown. */
export const GROUP_ORDER: readonly SearchGroupKey[] = [
  "actions",
  "pages",
  "people",
  "documents",
  "projects",
  "tickets",
  "posts",
  "values",
  "links",
];

/**
 * Trim, collapse whitespace and drop PostgREST's `*` wildcard alias.
 * Returns null when the result is shorter than SEARCH_MIN or longer than SEARCH_MAX.
 */
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.replace(/\*/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < SEARCH_MIN || q.length > SEARCH_MAX) return null;
  return q;
}

/** Escape LIKE/ILIKE metacharacters (\ % _) so the term matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%term%` with the term escaped, for a single-column .ilike(). */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`;
}

/**
 * A PostgREST `.or()` filter matching `term` in any of `columns`.
 * The value is double-quoted (so commas / parentheses in the term can't
 * break the filter list) with `"` and `\` backslash-escaped inside.
 */
export function orIlike(columns: readonly string[], term: string): string {
  const quoted = `"${containsPattern(term).replace(/["\\]/g, (c) => `\\${c}`)}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(",");
}

export interface StaticEntry {
  id: string;
  title: string;
  keywords: readonly string[];
  href: string;
  icon?: string;
  subtitle?: string;
}

/** Entries whose title/keywords contain every word of the query (case-insensitive). */
export function matchStatic(query: string, entries: readonly StaticEntry[], limit = SEARCH_LIMIT): SearchItem[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const out: SearchItem[] = [];
  for (const e of entries) {
    const hay = [e.title, ...e.keywords].join(" ").toLowerCase();
    if (tokens.every((tok) => hay.includes(tok))) {
      out.push({ id: e.id, title: e.title, subtitle: e.subtitle ?? null, href: e.href, icon: e.icon });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Ordered, non-empty groups; each capped at `limit` items and de-duplicated by id. */
export function buildGroups(
  parts: Partial<Record<SearchGroupKey, SearchItem[]>>,
  labels: Record<SearchGroupKey, string>,
  limit = SEARCH_LIMIT
): SearchGroup[] {
  const groups: SearchGroup[] = [];
  for (const key of GROUP_ORDER) {
    const seen = new Set<string>();
    const items = (parts[key] ?? []).filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true))).slice(0, limit);
    if (items.length) groups.push({ key, label: labels[key], items });
  }
  return groups;
}

/** Split `text` into plain / matched segments for highlighting `query` (case-insensitive). */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q || !text) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at < 0) break;
    if (at > i) parts.push({ text: text.slice(i, at), match: false });
    parts.push({ text: text.slice(at, at + q.length), match: true });
    i = at + q.length;
  }
  if (i < text.length) parts.push({ text: text.slice(i), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

/** Join non-empty bits with a middle dot. */
export function joinSub(...bits: (string | null | undefined)[]): string | null {
  const s = bits.map((b) => (b ?? "").trim()).filter(Boolean).join(" · ");
  return s || null;
}
