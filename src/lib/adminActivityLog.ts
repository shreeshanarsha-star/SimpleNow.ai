import { SupabaseClient } from "@supabase/supabase-js";

// Writes one row to admin_activity_log. Called right after an owner-console
// action succeeds (approve/suspend/grant/revoke/kill-switch/inspect), using
// the same service-role admin client the route already has -- never blocks
// or fails the actual action if logging itself has a problem.
export async function logAdminActivity(
  admin: SupabaseClient,
  params: {
    actorId: string;
    actorEmail?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await admin.from("admin_activity_log").insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      target_label: params.targetLabel ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error("[admin_activity_log] failed to write entry", err);
  }
}
