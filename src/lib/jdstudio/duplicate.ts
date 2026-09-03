import type { SupabaseClient } from "@supabase/supabase-js";

// Lightweight duplicate-JD detector: before sending/drafting, check this
// owner's existing requests in the same department for a similar title.
// Deliberately simple (token-overlap, no embeddings) -- same "good enough,
// cheap, explainable" bar as shortlistAI's dedup pass.
function normalize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export interface DuplicateCandidate {
  id: string;
  job_title: string | null;
  department: string;
  status: string;
  final_docx_path: string | null;
  score: number;
}

export async function findDuplicateCandidate(
  supabase: SupabaseClient,
  ownerId: string,
  department: string,
  jobTitle: string
): Promise<DuplicateCandidate | null> {
  if (!jobTitle || jobTitle.trim().length < 3) return null;

  const { data, error } = await supabase
    .from("jdstudio_requests")
    .select("id, job_title, department, status, final_docx_path")
    .eq("owner_id", ownerId)
    .eq("department", department)
    .in("status", ["approved", "published"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data?.length) return null;

  const target = normalize(jobTitle);
  let best: DuplicateCandidate | null = null;
  for (const row of data) {
    if (!row.job_title) continue;
    const score = jaccard(target, normalize(row.job_title));
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { ...row, score };
    }
  }
  return best;
}
