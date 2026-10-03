import { NextResponse } from "next/server";
import { guard, isUuid, jsonError, readBody } from "@/app/tools/nr-synergy/_home/server";
import { isReaction } from "@/app/tools/nr-synergy/_home/feedTypes";
import { findPost } from "../_post";

// POST { post_id, emoji }: toggle the caller's reaction on a post. User
// client (nrs_post_reactions allows all operations on own rows).
export async function POST(req: Request) {
  const g = await guard("home");
  if (!g.ok) return g.res;
  const { member, supabase } = g;

  const payload = await readBody(req);
  if (!isUuid(payload?.post_id)) return jsonError("post_id is required");
  if (!isReaction(payload?.emoji)) return jsonError("Unknown reaction");
  const emoji = payload.emoji;

  const post = await findPost(supabase, payload.post_id, member.org_id);
  if (!post) return jsonError("Post not found", 404);

  const { data: existing, error: exErr } = await supabase
    .from("nrs_post_reactions")
    .select("post_id")
    .eq("post_id", post.id)
    .eq("member_id", member.id)
    .eq("emoji", emoji)
    .maybeSingle();
  if (exErr) return jsonError(exErr.message, 500);

  if (existing) {
    const { error } = await supabase
      .from("nrs_post_reactions")
      .delete()
      .eq("post_id", post.id)
      .eq("member_id", member.id)
      .eq("emoji", emoji);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, active: false });
  }

  const { error } = await supabase
    .from("nrs_post_reactions")
    .upsert(
      { post_id: post.id, member_id: member.id, org_id: post.org_id, emoji },
      { onConflict: "post_id,member_id,emoji", ignoreDuplicates: true }
    );
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, active: true });
}
