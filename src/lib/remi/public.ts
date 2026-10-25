// Dr.Remi -- helpers shared by the public (no-login) customer endpoints.
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "./security";
import type { Workspace, SessionRow } from "./engine";

export const WS_PUBLIC_COLUMNS =
  "id,slug,name,assistant_name,tagline,industry,about,greeting,default_language,pricing_mode,handoff_message,consent_text,notify_emails,webhook_url,webhook_secret,voice,kiosk_idle_seconds,suggested_questions,active";

export async function loadWorkspaceBySlug(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(slug)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("remi_workspaces").select(WS_PUBLIC_COLUMNS).eq("slug", slug).maybeSingle();
  if (!data || !data.active) return null;
  return { admin, ws: data as unknown as Workspace & { kiosk_idle_seconds: number; suggested_questions: string[]; slug: string } };
}

export async function loadSession(admin: ReturnType<typeof createAdminClient>, workspaceId: string, token: unknown) {
  if (typeof token !== "string" || token.length < 30 || token.length > 100) return null;
  const { data } = await admin
    .from("remi_sessions")
    .select("id,workspace_id,channel,language,turn_count,consent,lead_id,ended_at,started_at")
    .eq("token_hash", hashToken(token))
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data || data.ended_at) return null;
  // Sessions expire after 12h of existence.
  if (Date.now() - new Date(data.started_at).getTime() > 12 * 3600_000) return null;
  return data as SessionRow & { ended_at: string | null };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const MAX_TURNS_PER_SESSION = 80;
