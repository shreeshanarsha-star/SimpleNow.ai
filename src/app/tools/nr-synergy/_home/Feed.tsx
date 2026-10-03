import type { SupabaseClient } from "@supabase/supabase-js";
import { home as s } from "@/lib/nrs/i18n/en/home";
import { memberNames } from "./server";
import { Card, EmptyLine, ErrorLine } from "./ui";
import { REACTIONS, type FeedComment, type FeedPost, type Reaction } from "./feedTypes";
import PostCard from "./PostCard";

interface PostRow {
  id: string;
  kind: FeedPost["kind"];
  title: string;
  body: string;
  author_member_id: string | null;
  pinned: boolean;
  published_at: string;
}

async function loadFeed(supabase: SupabaseClient, orgId: string, meId: string | null): Promise<FeedPost[]> {
  const { data: postData, error: pErr } = await supabase
    .from("nrs_posts")
    .select("id, kind, title, body, author_member_id, pinned, published_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(20);
  if (pErr) throw new Error(pErr.message);
  const posts = (postData ?? []) as PostRow[];
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);

  const [cRes, rRes] = await Promise.all([
    supabase
      .from("nrs_post_comments")
      .select("id, post_id, member_id, body, created_at")
      .in("post_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("nrs_post_reactions").select("post_id, member_id, emoji").in("post_id", ids),
  ]);
  if (cRes.error) throw new Error(cRes.error.message);
  if (rRes.error) throw new Error(rRes.error.message);
  const comments = (cRes.data ?? []) as { id: string; post_id: string; member_id: string; body: string; created_at: string }[];
  const reactions = (rRes.data ?? []) as { post_id: string; member_id: string; emoji: Reaction }[];

  const names = await memberNames(supabase, [...posts.map((p) => p.author_member_id), ...comments.map((c) => c.member_id)]);

  return posts.map((p) => {
    const counts = Object.fromEntries(REACTIONS.map((r) => [r, 0])) as Record<Reaction, number>;
    const mine: Reaction[] = [];
    for (const r of reactions) {
      if (r.post_id !== p.id || !(r.emoji in counts)) continue;
      counts[r.emoji] += 1;
      if (r.member_id === meId) mine.push(r.emoji);
    }
    const postComments: FeedComment[] = comments
      .filter((c) => c.post_id === p.id)
      .map((c) => ({ id: c.id, author: names.get(c.member_id) ?? "", body: c.body, created_at: c.created_at }));
    return {
      id: p.id,
      kind: p.kind,
      title: p.title,
      body: p.body,
      author: p.author_member_id ? names.get(p.author_member_id) ?? null : null,
      pinned: p.pinned,
      published_at: p.published_at,
      counts,
      mine,
      comments: postComments,
    };
  });
}

export default async function Feed({
  supabase,
  orgId,
  meId,
  tz,
}: {
  supabase: SupabaseClient;
  orgId: string;
  meId: string | null;
  tz: string;
}) {
  let posts: FeedPost[] = [];
  let failed = false;
  try {
    posts = await loadFeed(supabase, orgId, meId);
  } catch (e) {
    console.error("[nrs] feed", e);
    failed = true;
  }

  return (
    <section aria-labelledby="nrs-feed" className="flex flex-col gap-3 min-w-0">
      <h2 id="nrs-feed" className="text-[14.5px] font-bold text-ink">
        {s.feed.title}
      </h2>
      {failed ? (
        <ErrorLine>{s.sectionError}</ErrorLine>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyLine>{s.feed.empty}</EmptyLine>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} canInteract={!!meId} tz={tz} />
          ))}
        </ul>
      )}
    </section>
  );
}
