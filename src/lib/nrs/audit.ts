import type { SupabaseClient } from "@supabase/supabase-js";

// App-level audit entries for NR Synergy (nrs_audit_events is append-only).
// Row-level changes on sensitive tables are already captured by the
// nrs_audit_row() trigger; use this for *actions* (approve, export, wipe,
// view-as...) and for context the trigger can't see (service-role writes
// have auth.uid() = null, so the trigger can't name the real actor).

export interface AuditEntry {
  orgId: string | null;
  /** auth.users id of whoever caused the action; null for system jobs. */
  actorUser: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown>;
  /** Set during admin view-as sessions. */
  actingAsUser?: string | null;
}

/**
 * Insert one audit event with the service-role client. Best-effort: a
 * failure is logged and returned, never thrown, so it can't undo the
 * action being audited.
 */
export async function logAudit(admin: SupabaseClient, entry: AuditEntry): Promise<{ error: string | null }> {
  const { error } = await admin.from("nrs_audit_events").insert({
    org_id: entry.orgId,
    actor_user: entry.actorUser,
    acting_as_user: entry.actingAsUser ?? null,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    context: entry.context ?? {},
  });
  if (error) {
    console.error("[nrs] audit insert failed", entry.entity, entry.action, error.message);
    return { error: error.message };
  }
  return { error: null };
}
