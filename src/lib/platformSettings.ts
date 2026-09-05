import { SupabaseClient } from "@supabase/supabase-js";

// Owner-only global switches, backed by the platform_settings table.
// Absence of a key always means the default (on/enabled) -- so a fresh
// deploy or a row that was never written behaves exactly like today,
// before any of this existed. Every reader here is defensive about that.

export function toolPauseKey(featureKey: string): string {
  return `tool_paused:${featureKey}`;
}

export const GUEST_TRIAL_ENABLED_KEY = "guest_trial_enabled";

// Read one setting's boolean value. `defaultValue` is what's used when the
// row doesn't exist yet (the common case) or the query fails -- fails open
// to "not paused" / "enabled" rather than accidentally taking the whole
// platform down if this table has a hiccup.
export async function getBooleanSetting(
  client: SupabaseClient,
  key: string,
  defaultValue: boolean
): Promise<boolean> {
  try {
    const { data } = await client.from("platform_settings").select("value").eq("key", key).maybeSingle();
    if (!data) return defaultValue;
    const v = data.value;
    if (typeof v === "boolean") return v;
    if (v && typeof v === "object" && "enabled" in v) return !!(v as { enabled: boolean }).enabled;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function isToolPaused(client: SupabaseClient, featureKey: string): Promise<boolean> {
  return getBooleanSetting(client, toolPauseKey(featureKey), false);
}

export async function isGuestTrialEnabled(client: SupabaseClient): Promise<boolean> {
  return getBooleanSetting(client, GUEST_TRIAL_ENABLED_KEY, true);
}

// Fetch every platform_settings row at once, shaped for the Overview tab
// (which needs to list every tool's pause state plus the guest-trial
// switch in one screen without N round trips).
export async function getAllSettings(client: SupabaseClient): Promise<Record<string, unknown>> {
  const { data } = await client.from("platform_settings").select("key, value");
  const out: Record<string, unknown> = {};
  for (const row of data || []) out[row.key] = row.value;
  return out;
}

export async function setBooleanSetting(
  client: SupabaseClient,
  key: string,
  value: boolean,
  updatedBy: string
): Promise<void> {
  await client.from("platform_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  });
}
