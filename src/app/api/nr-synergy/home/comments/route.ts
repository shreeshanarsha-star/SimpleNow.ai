import { NextResponse } from "next/server";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { findPost } from "../_post";

// POST { post_id, body }: comment on a published post. User client
// (nrs_post_comments allows own insert in the caller's org).
export async function POST(req: Request) {
  const g = await guard("home");
  if (!g.ok) return g.res;
  const { member, supabase } = g;

  const payload = await readBody(req);
  if (!isUuid(payload?.post_id)) return jsonError("post_id is required");
  const text = optText(payload?.body, 2000);
  if (!text) return jsonError(text === undefined ? "Comment is too long (2000 characters max)" : "Write a comment first");

  const post = await findPost(supabase, payload.post_id, member.org_id);
  if (!post) return jsonError("Post not found", 404);

  const { error } = await supabase
    .from("nrs_post_comments")
    .insert({ post_id: post.id, org_id: post.org_id, member_id: member.id, body: text });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
