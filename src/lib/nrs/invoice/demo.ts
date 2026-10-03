import type { SupabaseClient } from "@supabase/supabase-js";
import seedJson from "../../../../supabase/seed/nr_synergy_demo.json";
import { toMinor } from "../money";
import { logAudit } from "../audit";
import { HttpError, dbCheck } from "./kit";

// Admin "Load demo data" / "Wipe demo data".
//
// Load: inserts supabase/seed/nr_synergy_demo.json into the caller's org.
// Symbolic refs (m1, v1, d1, p1) are resolved to the generated UUIDs. Rows
// on tables with an is_demo column get is_demo = true. Rows on tables
// WITHOUT is_demo (countries, rules, holidays, quick links, JOE media) are
// only inserted when missing, and their keys are recorded on the
// append-only audit event so Wipe can remove exactly those rows later.

interface SeedMember {
  ref: string;
  full_name: string;
  email: string;
  designation: string | null;
  department: string | null;
  division: string | null;
  home_country: string;
  manager_ref: string | null;
  languages: string[];
  roles: string[];
  engagement: { type: "consultant" | "payroll"; country_code: string; starts_on: string };
  joined_on: string | null;
  bio: string | null;
}

interface DemoSeed {
  version: number;
  brand: { display_name: string; reporting_currency: string };
  countries: { code: string; name: string; timezone: string; currency: string }[];
  country_rules: {
    country_code: string;
    effective_from: string;
    working_days: number[];
    std_hours_per_day: number;
    leave_rules: Record<string, unknown>;
    expense_limits: Record<string, number>;
  }[];
  holidays: { country_code: string; day: string; name: string }[];
  members: SeedMember[];
  values: { ref: string; name: string; meaning: string; behaviours: string[]; not_this: string[]; leader_message: string | null; sort: number }[];
  joe_media: { md_message_title: string; md_video_url: string | null; md_transcript: string };
  documents: {
    ref: string;
    category: string;
    title: string;
    country_code: string | null;
    audience: string;
    requires_ack: boolean;
    versions: { version: string; effective_from: string; summary: string; body_markdown: string }[];
  }[];
  projects: {
    ref: string;
    name: string;
    division: string;
    owner_ref: string;
    status: string;
    progress_pct: number;
    next_milestone: string | null;
    next_milestone_on: string | null;
    member_refs: string[];
    updates: {
      member_ref: string;
      week_of: string;
      status: string;
      progress: string;
      challenges: string | null;
      plan_of_action: string | null;
      help_needed_ref?: string;
      next_milestone: string | null;
      next_milestone_on: string | null;
    }[];
  }[];
  posts: { kind: string; title: string; body: string; author_ref: string; pinned: boolean; published_days_ago: number }[];
  events: { kind: string; title: string; starts_at: string; location: string | null; link: string | null }[];
  quick_links: { title: string; url: string; description: string | null; sort: number }[];
  contract_terms: {
    member_ref: string;
    effective_from: string;
    basis: string;
    fee: string;
    currency: string;
    paid_leave_days_per_year: string;
    reimbursables: string[];
    tax: Record<string, unknown>;
    notice_days: number | null;
    clause_refs: Record<string, unknown>;
  }[];
}

const SEED = seedJson as unknown as DemoSeed;

interface DemoRecord {
  country_codes: string[];
  rule_ids: string[];
  holiday_ids: string[];
  quick_link_ids: string[];
  joe_media_created: boolean;
  org_settings_created: boolean;
}

export interface DemoCounts {
  [table: string]: number;
}

async function insertMany(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  select = "id"
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const { data, error } = await admin.from(table).insert(rows).select(select);
  dbCheck(error, `Demo ${table}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export async function isDemoLoaded(admin: SupabaseClient, orgId: string): Promise<boolean> {
  const { count } = await admin
    .from("nrs_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_demo", true);
  return (count ?? 0) > 0;
}

export async function loadDemoData(admin: SupabaseClient, orgId: string, actorUser: string): Promise<DemoCounts> {
  if (await isDemoLoaded(admin, orgId)) throw new HttpError("Demo data is already loaded. Wipe it first.", 409);
  const counts: DemoCounts = {};
  const rec: DemoRecord = {
    country_codes: [],
    rule_ids: [],
    holiday_ids: [],
    quick_link_ids: [],
    joe_media_created: false,
    org_settings_created: false,
  };

  try {
    // Org settings (only when missing).
    const { data: settings } = await admin.from("nrs_org_settings").select("org_id").eq("org_id", orgId).maybeSingle();
    if (!settings) {
      const { error } = await admin.from("nrs_org_settings").insert({
        org_id: orgId,
        display_name: SEED.brand.display_name,
        reporting_currency: SEED.brand.reporting_currency,
      });
      dbCheck(error, "Demo org settings");
      rec.org_settings_created = true;
    }

    // Countries, rules, holidays: only the missing ones.
    const { data: haveCountries } = await admin.from("nrs_countries").select("code").eq("org_id", orgId);
    const have = new Set(((haveCountries ?? []) as { code: string }[]).map((c) => c.code));
    const newCountries = SEED.countries.filter((c) => !have.has(c.code));
    await insertMany(admin, "nrs_countries", newCountries.map((c) => ({ ...c, org_id: orgId })), "code");
    rec.country_codes = newCountries.map((c) => c.code);
    counts.nrs_countries = newCountries.length;

    const { data: haveRules } = await admin.from("nrs_country_rules").select("country_code, effective_from").eq("org_id", orgId);
    const ruleKeys = new Set(((haveRules ?? []) as { country_code: string; effective_from: string }[]).map((r) => `${r.country_code}|${r.effective_from}`));
    const rules = await insertMany(
      admin,
      "nrs_country_rules",
      SEED.country_rules.filter((r) => !ruleKeys.has(`${r.country_code}|${r.effective_from}`)).map((r) => ({ ...r, org_id: orgId }))
    );
    rec.rule_ids = rules.map((r) => String(r.id));
    counts.nrs_country_rules = rules.length;

    const { data: haveHol } = await admin.from("nrs_holidays").select("country_code, day").eq("org_id", orgId);
    const holKeys = new Set(((haveHol ?? []) as { country_code: string; day: string }[]).map((h) => `${h.country_code}|${h.day}`));
    const hols = await insertMany(
      admin,
      "nrs_holidays",
      SEED.holidays.filter((h) => !holKeys.has(`${h.country_code}|${h.day}`)).map((h) => ({ ...h, org_id: orgId, source: "import" }))
    );
    rec.holiday_ids = hols.map((h) => String(h.id));
    counts.nrs_holidays = hols.length;

    // Members (two passes: insert, then managers).
    const memberRows = await insertMany(
      admin,
      "nrs_members",
      SEED.members.map((m) => ({
        org_id: orgId,
        full_name: m.full_name,
        email: m.email,
        designation: m.designation,
        department: m.department,
        division: m.division,
        home_country: m.home_country,
        languages: m.languages,
        bio: m.bio,
        joined_on: m.joined_on,
        is_demo: true,
      })),
      "id, email"
    );
    const byEmail = new Map(memberRows.map((r) => [String(r.email), String(r.id)]));
    const M = new Map<string, string>();
    for (const m of SEED.members) {
      const id = byEmail.get(m.email);
      if (!id) throw new HttpError(`Demo member ${m.ref} was not created`, 500);
      M.set(m.ref, id);
    }
    const ref = (r: string | null | undefined): string | null => (r ? (M.get(r) ?? null) : null);
    counts.nrs_members = memberRows.length;

    for (const m of SEED.members) {
      if (!m.manager_ref) continue;
      const { error } = await admin.from("nrs_members").update({ manager_id: ref(m.manager_ref) }).eq("id", ref(m.ref));
      dbCheck(error, "Demo managers");
    }
    const roleRows = SEED.members.flatMap((m) => m.roles.map((role) => ({ member_id: ref(m.ref), role })));
    if (roleRows.length) {
      const { error } = await admin.from("nrs_member_roles").insert(roleRows);
      dbCheck(error, "Demo roles");
    }
    const engRows = await insertMany(
      admin,
      "nrs_engagements",
      SEED.members.map((m) => ({ org_id: orgId, member_id: ref(m.ref), ...m.engagement, is_demo: true })),
      "id, member_id"
    );
    const engByMember = new Map(engRows.map((e) => [String(e.member_id), String(e.id)]));
    counts.nrs_engagements = engRows.length;

    // Contracts + verified terms (one per consultant).
    const now = new Date().toISOString();
    for (const t of SEED.contract_terms) {
      const memberId = ref(t.member_ref);
      if (!memberId) continue;
      const { data: c, error: cErr } = await admin
        .from("nrs_contracts")
        .insert({
          org_id: orgId,
          member_id: memberId,
          engagement_id: engByMember.get(memberId) ?? null,
          file_name: "Demo contract (no file)",
          status: "verified",
          extraction: { demo: true },
          uploaded_by: actorUser,
          verified_by: actorUser,
          verified_at: now,
          is_demo: true,
        })
        .select("id")
        .single();
      dbCheck(cErr, "Demo contract");
      const { error: tErr } = await admin.from("nrs_contract_terms").insert({
        org_id: orgId,
        contract_id: (c as { id: string }).id,
        member_id: memberId,
        effective_from: t.effective_from,
        basis: t.basis,
        fee_minor: toMinor(t.fee, t.currency),
        currency: t.currency,
        paid_leave_days_per_year: t.paid_leave_days_per_year,
        reimbursables: t.reimbursables,
        tax: t.tax,
        notice_days: t.notice_days,
        clause_refs: t.clause_refs,
        verified_by: actorUser,
        verified_at: now,
        is_demo: true,
      });
      dbCheck(tErr, "Demo contract terms");
    }
    counts.nrs_contract_terms = SEED.contract_terms.length;

    // Values, JOE.
    const valueRows = await insertMany(
      admin,
      "nrs_values",
      SEED.values.map(({ ref: _r, ...v }) => ({ ...v, org_id: orgId, is_demo: true }))
    );
    counts.nrs_values = valueRows.length;
    const { data: joe } = await admin.from("nrs_joe_media").select("org_id").eq("org_id", orgId).maybeSingle();
    if (!joe) {
      const { error } = await admin.from("nrs_joe_media").insert({ org_id: orgId, ...SEED.joe_media });
      dbCheck(error, "Demo JOE media");
      rec.joe_media_created = true;
    }

    // Documents + published versions.
    for (const d of SEED.documents) {
      const { data: doc, error } = await admin
        .from("nrs_documents")
        .insert({
          org_id: orgId,
          category: d.category,
          title: d.title,
          country_code: d.country_code,
          audience: d.audience,
          requires_ack: d.requires_ack,
          is_demo: true,
        })
        .select("id")
        .single();
      dbCheck(error, "Demo document");
      const docId = (doc as { id: string }).id;
      const { error: vErr } = await admin.from("nrs_document_versions").insert(
        d.versions.map((v) => ({ ...v, document_id: docId, org_id: orgId, published_at: now, published_by: actorUser }))
      );
      dbCheck(vErr, "Demo document version");
    }
    counts.nrs_documents = SEED.documents.length;

    // Projects, members, updates.
    let updates = 0;
    for (const p of SEED.projects) {
      const { data: proj, error } = await admin
        .from("nrs_projects")
        .insert({
          org_id: orgId,
          name: p.name,
          division: p.division,
          owner_member_id: ref(p.owner_ref),
          status: p.status,
          progress_pct: p.progress_pct,
          next_milestone: p.next_milestone,
          next_milestone_on: p.next_milestone_on,
          is_demo: true,
        })
        .select("id")
        .single();
      dbCheck(error, "Demo project");
      const projectId = (proj as { id: string }).id;
      const { error: pmErr } = await admin
        .from("nrs_project_members")
        .insert(p.member_refs.map((r) => ({ project_id: projectId, member_id: ref(r) })));
      dbCheck(pmErr, "Demo project members");
      if (p.updates.length) {
        const { error: uErr } = await admin.from("nrs_project_updates").insert(
          p.updates.map((u) => ({
            org_id: orgId,
            project_id: projectId,
            member_id: ref(u.member_ref),
            week_of: u.week_of,
            status: u.status,
            progress: u.progress,
            challenges: u.challenges,
            plan_of_action: u.plan_of_action,
            help_needed_member_id: ref(u.help_needed_ref),
            next_milestone: u.next_milestone,
            next_milestone_on: u.next_milestone_on,
            is_demo: true,
          }))
        );
        dbCheck(uErr, "Demo project updates");
        updates += p.updates.length;
      }
    }
    counts.nrs_projects = SEED.projects.length;
    counts.nrs_project_updates = updates;

    // Posts, events, quick links.
    const nowMs = Date.now();
    const posts = await insertMany(
      admin,
      "nrs_posts",
      SEED.posts.map((p) => ({
        org_id: orgId,
        kind: p.kind,
        title: p.title,
        body: p.body,
        author_member_id: ref(p.author_ref),
        pinned: p.pinned,
        published_at: new Date(nowMs - p.published_days_ago * 86_400_000).toISOString(),
        is_demo: true,
      }))
    );
    counts.nrs_posts = posts.length;
    const events = await insertMany(admin, "nrs_events", SEED.events.map((e) => ({ ...e, org_id: orgId, is_demo: true })));
    counts.nrs_events = events.length;
    const links = await insertMany(admin, "nrs_quick_links", SEED.quick_links.map((l) => ({ ...l, org_id: orgId })));
    rec.quick_link_ids = links.map((l) => String(l.id));
    counts.nrs_quick_links = links.length;
  } catch (e) {
    // Best-effort rollback of what was created so a retry starts clean.
    await wipeDemoData(admin, orgId, actorUser, rec).catch((err: unknown) => console.error("[nrs] demo rollback failed", err));
    throw e;
  }

  await logAudit(admin, {
    orgId,
    actorUser,
    entity: "nrs_demo",
    action: "load_demo",
    after: { record: rec, counts, seed_version: SEED.version },
  });
  return counts;
}

/** Records of demo loads since the last wipe (older loads were already wiped). */
async function demoRecords(admin: SupabaseClient, orgId: string): Promise<DemoRecord[]> {
  const { data: lastWipe } = await admin
    .from("nrs_audit_events")
    .select("at")
    .eq("org_id", orgId)
    .eq("entity", "nrs_demo")
    .eq("action", "wipe_demo")
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let q = admin
    .from("nrs_audit_events")
    .select("after")
    .eq("org_id", orgId)
    .eq("entity", "nrs_demo")
    .eq("action", "load_demo");
  const since = (lastWipe as { at: string } | null)?.at;
  if (since) q = q.gt("at", since);
  const { data } = await q;
  return ((data ?? []) as { after: { record?: DemoRecord } | null }[])
    .map((r) => r.after?.record)
    .filter((r): r is DemoRecord => !!r);
}

async function ids(admin: SupabaseClient, table: string, orgId: string): Promise<string[]> {
  const { data, error } = await admin.from(table).select("id").eq("org_id", orgId).eq("is_demo", true);
  dbCheck(error, `Demo ${table}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function del(admin: SupabaseClient, counts: DemoCounts, table: string, build: (q: ReturnType<SupabaseClient["from"]>) => PromiseLike<{ error: { message: string } | null; count: number | null }>) {
  const { error, count } = await build(admin.from(table));
  dbCheck(error, `Wiping ${table}`);
  counts[table] = (counts[table] ?? 0) + (count ?? 0);
}

const IS_DEMO_TABLES_IN_ORDER = [
  "nrs_requests",
  "nrs_expenses",
  "nrs_travel_requests",
  "nrs_leave_requests",
  "nrs_corrections",
  "nrs_work_logs",
  "nrs_project_updates",
  "nrs_tickets",
  "nrs_assets",
  "nrs_checklist_items",
] as const;

/**
 * Delete every is_demo row in the org in FK-safe order, plus the recorded
 * non-flagged rows. `only` limits the recorded part to one load (rollback).
 */
export async function wipeDemoData(
  admin: SupabaseClient,
  orgId: string,
  actorUser: string,
  only?: DemoRecord
): Promise<DemoCounts> {
  const counts: DemoCounts = {};
  const [memberIds, valueIds, termIds] = await Promise.all([
    ids(admin, "nrs_members", orgId),
    ids(admin, "nrs_values", orgId),
    ids(admin, "nrs_contract_terms", orgId),
  ]);

  // Kudos reference values with ON DELETE RESTRICT.
  await del(admin, counts, "nrs_kudos", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).eq("is_demo", true));
  if (valueIds.length) {
    await del(admin, counts, "nrs_kudos", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("value_id", valueIds));
  }
  // Invoices reference contract terms without cascade.
  await del(admin, counts, "nrs_invoices", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).eq("is_demo", true));
  if (memberIds.length) await del(admin, counts, "nrs_invoices", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("member_id", memberIds));
  if (termIds.length) await del(admin, counts, "nrs_invoices", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("terms_id", termIds));

  for (const t of IS_DEMO_TABLES_IN_ORDER) {
    await del(admin, counts, t, (q) => q.delete({ count: "exact" }).eq("org_id", orgId).eq("is_demo", true));
  }
  for (const t of ["nrs_contract_terms", "nrs_contracts", "nrs_engagements", "nrs_posts", "nrs_events", "nrs_documents", "nrs_projects", "nrs_values"]) {
    await del(admin, counts, t, (q) => q.delete({ count: "exact" }).eq("org_id", orgId).eq("is_demo", true));
  }
  if (memberIds.length) {
    // Requests owned by demo members but not flagged (e.g. created by the app).
    await del(admin, counts, "nrs_requests", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("member_id", memberIds));
  }
  await del(admin, counts, "nrs_members", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).eq("is_demo", true));

  // Recorded rows on tables without is_demo.
  const records = only ? [only] : await demoRecords(admin, orgId);
  const qlIds = records.flatMap((r) => r.quick_link_ids);
  const holIds = records.flatMap((r) => r.holiday_ids);
  const ruleIds = records.flatMap((r) => r.rule_ids);
  if (qlIds.length) await del(admin, counts, "nrs_quick_links", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("id", qlIds));
  if (holIds.length) await del(admin, counts, "nrs_holidays", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("id", holIds));
  if (ruleIds.length) await del(admin, counts, "nrs_country_rules", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("id", ruleIds));
  const codes = Array.from(new Set(records.flatMap((r) => r.country_codes)));
  if (codes.length) {
    // Keep a country if real members still live there.
    const { data: used } = await admin.from("nrs_members").select("home_country").eq("org_id", orgId).in("home_country", codes);
    const keep = new Set(((used ?? []) as { home_country: string }[]).map((u) => u.home_country));
    const drop = codes.filter((c) => !keep.has(c));
    if (drop.length) await del(admin, counts, "nrs_countries", (q) => q.delete({ count: "exact" }).eq("org_id", orgId).in("code", drop));
  }
  if (records.some((r) => r.joe_media_created)) {
    await del(admin, counts, "nrs_joe_media", (q) =>
      q.delete({ count: "exact" }).eq("org_id", orgId).eq("md_message_title", SEED.joe_media.md_message_title)
    );
  }

  if (!only) {
    await logAudit(admin, { orgId, actorUser, entity: "nrs_demo", action: "wipe_demo", after: { counts } });
  }
  return counts;
}
