import { handle, requireRemi, jsonError, isUuid } from "@/lib/remi/access";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string }> };

// GET ?session=<id> -> full transcript; otherwise the latest 200 sessions.
// Conversation transcripts are visible to admins/owners/viewers; reps see
// transcripts only through leads they can access.
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, role } = await requireRemi(id);
    if (role === "rep") return jsonError("Reps see conversations through their leads.", 403);
    const url = new URL(req.url);
    const sid = url.searchParams.get("session");
    if (sid) {
      if (!isUuid(sid)) return jsonError("Not found.", 404);
      const { data: s } = await admin.from("remi_sessions").select("id,channel,language,turn_count,consent,lead_id,summary,started_at,last_active_at,ended_at").eq("id", sid).eq("workspace_id", id).maybeSingle();
      if (!s) return jsonError("Not found.", 404);
      const { data: messages } = await admin.from("remi_messages").select("id,role,content,language,topic,meta,created_at").eq("session_id", sid).order("id").limit(300);
      return Response.json({ session: s, messages: messages || [] });
    }
    const { data } = await admin
      .from("remi_sessions")
      .select("id,channel,language,turn_count,consent,lead_id,summary,started_at,last_active_at,ended_at")
      .eq("workspace_id", id)
      .gt("turn_count", 0)
      .order("started_at", { ascending: false })
      .limit(200);
    return Response.json({ sessions: data || [] });
  });
}
