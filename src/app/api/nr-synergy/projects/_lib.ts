import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid, optText } from "@/app/tools/nr-synergy/_home/server";
import { isProjectStatus, parseTags, type ProjectStatus } from "@/app/tools/nr-synergy/projects/_lib";
import { toMinor } from "@/lib/nrs/money";

// Shared validation for the project create / resubmit / edit routes.

export interface ProjectInput {
  name: string;
  description: string;
  owner_member_id: string;
  status: ProjectStatus;
  value_minor: number | null;
  value_currency: string | null;
  next_steps: string | null;
  tags: string[];
  division: string | null;
  country_code: string | null;
  member_ids: string[];
}

export type Parsed = { ok: true; input: ProjectInput } | { ok: false; error: string };

/** What the caller may decide. Members can't pick the owner or set the status. */
export interface ParseRules {
  /** Owner used when the caller may not choose one (or gives none). */
  defaultOwner: string;
  /** Status kept when the caller may not set it. */
  defaultStatus: ProjectStatus;
  /** HR, or the owner's manager when editing. */
  canAssignOwner: boolean;
  /** HR, or the owner's manager. */
  canSetStatus: boolean;
}

/**
 * Validate a project body. Owner and status come from the body only when the
 * rules allow it; otherwise the defaults are kept whatever the client sent.
 * Owner, members and country are checked against the org with the
 * service-role client (the directory is org-readable anyway).
 */
export async function parseProjectInput(
  admin: SupabaseClient,
  orgId: string,
  body: Record<string, unknown>,
  rules: ParseRules
): Promise<Parsed> {
  const defaultOwner = rules.defaultOwner;
  const name = optText(body.name, 200);
  if (!name) return { ok: false, error: name === undefined ? "Project name is too long (200 characters max)." : "Give the project a name." };
  const description = optText(body.description, 4000);
  if (description === undefined) return { ok: false, error: "Description is too long (4,000 characters max)." };
  if (!description) return { ok: false, error: "Add a short description." };
  let status: ProjectStatus = rules.defaultStatus;
  if (rules.canSetStatus && body.status != null && body.status !== "") {
    if (!isProjectStatus(body.status)) return { ok: false, error: "Choose a valid status." };
    status = body.status;
  }
  const nextSteps = optText(body.next_steps, 2000);
  if (nextSteps === undefined) return { ok: false, error: "Next steps are too long (2,000 characters max)." };
  const division = optText(body.division, 120);
  if (division === undefined) return { ok: false, error: "Division is too long." };

  const owner =
    !rules.canAssignOwner || body.owner_member_id == null || body.owner_member_id === "" ? defaultOwner : body.owner_member_id;
  if (!isUuid(owner)) return { ok: false, error: "Choose a valid project owner." };

  // Value: decimal string + ISO currency -> integer minor units.
  let valueMinor: number | null = null;
  let valueCurrency: string | null = null;
  const rawAmount = typeof body.value_amount === "number" ? String(body.value_amount) : body.value_amount;
  if (rawAmount != null && rawAmount !== "") {
    if (typeof rawAmount !== "string") return { ok: false, error: "Enter the value as a number." };
    const cur = typeof body.value_currency === "string" ? body.value_currency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(cur)) return { ok: false, error: "Choose a currency for the value." };
    try {
      valueMinor = toMinor(rawAmount, cur);
    } catch {
      return { ok: false, error: "Enter the value as a number, e.g. 250000 or 1250.50." };
    }
    if (valueMinor < 0) return { ok: false, error: "The value can't be negative." };
    valueCurrency = cur;
  }

  let tags: string[] = [];
  if (Array.isArray(body.tags)) tags = parseTags(body.tags.filter((t): t is string => typeof t === "string").join(","));
  else if (typeof body.tags === "string") tags = parseTags(body.tags);

  let country: string | null = null;
  if (body.country_code != null && body.country_code !== "") {
    if (typeof body.country_code !== "string" || !/^[A-Za-z]{2}$/.test(body.country_code)) {
      return { ok: false, error: "Choose a valid country." };
    }
    country = body.country_code.toUpperCase();
    const { data } = await admin.from("nrs_countries").select("code").eq("org_id", orgId).eq("code", country).maybeSingle();
    if (!data) return { ok: false, error: "That country isn't set up for your organisation." };
  }

  const rawMembers = Array.isArray(body.member_ids) ? body.member_ids : [];
  if (rawMembers.length > 60) return { ok: false, error: "That's too many members (60 max)." };
  if (!rawMembers.every(isUuid)) return { ok: false, error: "A team member is invalid." };
  const memberIds = Array.from(new Set([owner, ...(rawMembers as string[])]));
  const { data: found, error } = await admin
    .from("nrs_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("id", memberIds);
  if (error) return { ok: false, error: error.message };
  const ok = new Set(((found ?? []) as { id: string }[]).map((m) => m.id));
  if (!ok.has(owner)) return { ok: false, error: "The project owner wasn't found in your organisation." };
  if (memberIds.some((id) => !ok.has(id))) return { ok: false, error: "A team member wasn't found in your organisation." };

  return {
    ok: true,
    input: {
      name,
      description,
      owner_member_id: owner,
      status,
      value_minor: valueMinor,
      value_currency: valueCurrency,
      next_steps: nextSteps,
      tags,
      division,
      country_code: country,
      member_ids: memberIds,
    },
  };
}

/** The project row columns for an input (members are stored separately). */
export function projectFields(i: ProjectInput) {
  return {
    name: i.name,
    description: i.description,
    owner_member_id: i.owner_member_id,
    status: i.status,
    value_minor: i.value_minor,
    value_currency: i.value_currency,
    next_steps: i.next_steps,
    tags: i.tags,
    division: i.division,
    country_code: i.country_code,
  };
}

/** Replace the project's member list (owner always included). */
export async function replaceMembers(admin: SupabaseClient, projectId: string, memberIds: string[]): Promise<string | null> {
  const { error: delErr } = await admin.from("nrs_project_members").delete().eq("project_id", projectId);
  if (delErr) return delErr.message;
  if (!memberIds.length) return null;
  const { error } = await admin
    .from("nrs_project_members")
    .insert(memberIds.map((member_id) => ({ project_id: projectId, member_id })));
  return error ? error.message : null;
}
