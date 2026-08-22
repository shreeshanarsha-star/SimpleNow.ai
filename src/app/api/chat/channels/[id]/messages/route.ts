import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberDisplayName, parseMentions } from "@/lib/chat";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params;
  let supabase, orgId;
  try {
    ({ supabase, orgId } = await requireOrgMember());
  } catch (res) {
    return res as Response;
  }

  const { data: channel } = await supabase
    .from("chat_channels")
    .select("id, org_id")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel || channel.org_id !== orgId) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select("id, body, user_id, mentioned_user_ids, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const senderIds = [...new Set((messages ?? []).map((m) => m.user_id))];
  const { data: senders } = senderIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", senderIds)
    : { data: [] };
  const senderMap = new Map((senders ?? []).map((s) => [s.id, memberDisplayName(s)]));

  return NextResponse.json({
    messages: (messages ?? []).map((m) => ({ ...m, senderName: senderMap.get(m.user_id) ?? "Member" })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params;
  let user, supabase, orgId, displayName;
  try {
    ({ user, supabase, orgId, displayName } = await requireOrgMember());
  } catch (res) {
    return res as Response;
  }

  if (!orgId) {
    return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });

  const { data: channel } = await supabase
    .from("chat_channels")
    .select("id, org_id, name")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel || channel.org_id !== orgId) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const { data: orgMembers } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("org_id", orgId);

  const members = (orgMembers ?? []).map((m) => ({ id: m.id, displayName: memberDisplayName(m) }));
  const mentionedUserIds = parseMentions(text, members).filter((id) => id !== user.id);

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      org_id: orgId,
      channel_id: channelId,
      user_id: user.id,
      body: text,
      mentioned_user_ids: mentionedUserIds,
    })
    .select("id, body, user_id, mentioned_user_ids, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (mentionedUserIds.length) {
    // notifications RLS only allows inserting your own row (user_id =
    // auth.uid()) -- fanning a mention out to other org members needs the
    // admin client. Safe here because channelId/orgId/mentionedUserIds
    // were all already validated against the caller's own org above.
    const excerpt = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    const admin = createAdminClient();
    await admin.from("notifications").insert(
      mentionedUserIds.map((mentionedId) => ({
        user_id: mentionedId,
        org_id: orgId,
        feature_key: "Team Chat",
        title: `${displayName} mentioned you in #${channel.name}`,
        body: excerpt,
        link: `/chat?channel=${channelId}`,
      }))
    );
  }

  return NextResponse.json({ message: { ...message, senderName: displayName } });
}
