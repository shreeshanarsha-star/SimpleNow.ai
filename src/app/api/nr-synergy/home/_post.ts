import type { SupabaseClient } from "@supabase/supabase-js";

/** A published, non-deleted post in the caller's org, or null. */
export async function findPost(supabase: SupabaseClient, postId: string, orgId: string): Promise<{ id: string; org_id: string } | null> {
  const { data } = await supabase
    .from("nrs_posts")
    .select("id, org_id, published_at")
    .eq("id", postId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .maybeSingle();
  return (data as { id: string; org_id: string } | null) ?? null;
}
