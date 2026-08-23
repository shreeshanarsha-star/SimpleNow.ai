import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Lets the UI reload a conversation's message history after a page refresh
// without losing context -- RLS already scopes this to the caller's own
// conversation, so a foreign id simply returns not-found rather than error.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: convo } = await supabase
    .from("ask_shree_conversations")
    .select("id, title, task_state, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const { data: messages, error } = await supabase
    .from("ask_shree_messages")
    .select("id, role, content, tools_used, result_type, result_data, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conversation: convo, messages: messages || [] });
}
