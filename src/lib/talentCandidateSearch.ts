import type { SupabaseClient } from "@supabase/supabase-js";

export type ScoredTalentCandidate = Record<string, unknown> & {
  _score: number;
  _resumeSnippet?: string | null;
  _matchedKeywords?: string[];
  _otherApplicationsCount?: number;
};

// Master candidate search, shared by the manual free-text box and the
// JD-upload flow. A manual search passes a single-element keywords array
// (preserves the original one-substring-must-appear behavior exactly);
// a JD upload passes several AI-extracted keywords, matched with OR
// across every keyword x every searchable field, then ranked by how many
// keywords each candidate actually hits (plus the existing scorecard
// boost) -- a resume matching 6 of 8 JD skills outranks one matching 2.
export async function searchTalentCandidates(
  supabase: SupabaseClient,
  keywords: string[]
): Promise<ScoredTalentCandidate[]> {
  const cleanKeywords = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    )
  ).slice(0, 12);

  if (cleanKeywords.length === 0) return [];

  const orParts: string[] = [];
  for (const kw of cleanKeywords) {
    const like = `%${kw}%`;
    orParts.push(
      `name.ilike.${like}`,
      `email.ilike.${like}`,
      `phone.ilike.${like}`,
      `resume_text.ilike.${like}`,
      `current_company.ilike.${like}`,
      `current_location.ilike.${like}`,
      `qualification.ilike.${like}`
    );
  }

  const { data: candidates, error } = await supabase
    .from("talent_candidates")
    .select(
      "*, talent_scorecards(rating, recommendation), talent_requisitions(req_no, title, location)"
    )
    .or(orParts.join(","))
    .limit(300);
  if (error) throw new Error(error.message);

  function snippetAround(text: string | null, needle: string): string | null {
    if (!text) return null;
    const idx = text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx === -1) return null;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + needle.length + 60);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  }

  let scored: ScoredTalentCandidate[] = (candidates || []).map((c) => {
    const cards = (c.talent_scorecards || []) as { rating: number | null; recommendation: string | null }[];
    const bestRating = cards.reduce((max, s) => Math.max(max, s.rating || 0), 0);
    const strongRec = cards.some((s) => s.recommendation === "strong_yes" || s.recommendation === "yes");

    const haystacks = [
      c.name as string | null,
      c.resume_text as string | null,
      c.current_company as string | null,
      c.current_location as string | null,
      c.qualification as string | null,
      ...(Array.isArray(c.tags) ? (c.tags as string[]) : []),
    ]
      .filter(Boolean)
      .map((s) => (s as string).toLowerCase());

    const matchedKeywords = cleanKeywords.filter((kw) =>
      haystacks.some((h) => h.includes(kw.toLowerCase()))
    );

    let score = matchedKeywords.length * 3;
    if ((c.name || "").toLowerCase().includes(matchedKeywords[0]?.toLowerCase() || "")) score += 1;
    score += bestRating * 0.5;
    if (strongRec) score += 2;

    const resumeSnippet = matchedKeywords.length
      ? snippetAround(c.resume_text as string | null, matchedKeywords[0])
      : null;

    return { ...c, _score: score, _resumeSnippet: resumeSnippet, _matchedKeywords: matchedKeywords };
  });

  scored.sort((a, b) => b._score - a._score);

  // Person-level dedupe -- keep each person's highest-scoring application
  // as the representative row.
  const seenPersonIds = new Set<string>();
  const otherAppCountByPerson = new Map<string, number>();
  for (const c of scored) {
    const pid = c.person_id as string | null;
    if (pid) otherAppCountByPerson.set(pid, (otherAppCountByPerson.get(pid) || 0) + 1);
  }
  scored = scored.filter((c) => {
    const pid = c.person_id as string | null;
    if (!pid) return true;
    if (seenPersonIds.has(pid)) return false;
    seenPersonIds.add(pid);
    return true;
  });
  scored = scored.map((c) => {
    const pid = c.person_id as string | null;
    const otherCount = pid ? (otherAppCountByPerson.get(pid) || 1) - 1 : 0;
    return { ...c, _otherApplicationsCount: otherCount };
  });

  return scored;
}
