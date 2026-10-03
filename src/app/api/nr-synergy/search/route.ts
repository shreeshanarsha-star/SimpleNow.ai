import { NextResponse, type NextRequest } from "next/server";
import { requireNrs, type NrsContext } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { search as s } from "@/lib/nrs/i18n/en/search";
import { knowledge as ks } from "@/lib/nrs/i18n/en/knowledge";
import { help as hs } from "@/lib/nrs/i18n/en/help";
import { projects as ps } from "@/lib/nrs/i18n/en/projects";
import { canOpenTab, NRS_ADMIN_BASE, NRS_BASE, NRS_TABS, nrsTab, type NrsTabKey } from "@/lib/nrs/tabs";
import {
  buildGroups,
  containsPattern,
  joinSub,
  matchStatic,
  normalizeQuery,
  orIlike,
  SEARCH_LIMIT,
  type SearchGroupKey,
  type SearchItem,
  type StaticEntry,
} from "@/lib/nrs/search";
import { audienceMatches, type DocAudience, type DocCategory } from "@/app/tools/nr-synergy/knowledge/_lib";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/search?q=  -- the NR Synergy global search.
//
// Every query runs on the caller's own (RLS) client, so row visibility is
// exactly what each module page would show. On top of RLS we apply the same
// page-level rules the target pages use (tab feature switches, document
// audience, project membership), so a result never links to a "not found".

const LABELS: Record<SearchGroupKey, string> = s.groups;

function canTab(key: NrsTabKey, ctx: NrsContext): boolean {
  return canOpenTab(nrsTab(key), ctx);
}

function staticPages(ctx: NrsContext): StaticEntry[] {
  const out: StaticEntry[] = [];
  for (const tab of NRS_TABS) {
    if (!canOpenTab(tab, ctx) || (!tab.built && !ctx.isHr)) continue;
    out.push({ id: `page-${tab.key}`, title: t(tab.label), keywords: s.pageKeywords[tab.key], href: tab.href, icon: tab.icon });
    if (tab.key === "knowledge" && ctx.member) {
      out.push({ id: "page-joe", title: s.joeTitle, keywords: s.pageKeywords.joe, href: `${NRS_BASE}/knowledge/joe`, icon: "award" });
    }
  }
  return out;
}

function staticActions(ctx: NrsContext): StaticEntry[] {
  const out: StaticEntry[] = [];
  const a = s.actions;
  const add = (id: string, def: (typeof a)[keyof typeof a], href: string, icon: string) =>
    out.push({ id, title: def.title, subtitle: def.subtitle, keywords: def.keywords, href, icon });
  if (ctx.member && canTab("time", ctx)) {
    add("action-check-in", a.checkIn, `${NRS_BASE}/time`, "clock");
    add("action-apply-leave", a.applyLeave, `${NRS_BASE}/time`, "calendar");
  }
  if (ctx.member && canTab("money", ctx)) add("action-submit-expense", a.submitExpense, `${NRS_BASE}/money`, "receipt");
  if (ctx.member && canTab("help", ctx)) add("action-raise-ticket", a.raiseTicket, `${NRS_BASE}/help#nrs-new-ticket`, "headset");
  // Admin lives in the separate Admin Console; HR get exactly one way there.
  if (ctx.isHr) add("action-open-admin-console", a.openAdminConsole, NRS_ADMIN_BASE, "gear");
  return out;
}

type Settled = PromiseSettledResult<{ data: unknown; error: { message: string } | null }>;

/** Rows of a settled query, or [] (logged) when it failed -- one bad module never blanks the whole search. */
function rows<T>(label: string, res: Settled): T[] {
  if (res.status === "rejected") {
    console.error(`[nrs-search] ${label}:`, res.reason);
    return [];
  }
  if (res.value.error) {
    console.error(`[nrs-search] ${label}:`, res.value.error.message);
    return [];
  }
  return Array.isArray(res.value.data) ? (res.value.data as T[]) : [];
}

const EMPTY = Promise.resolve({ data: [] as unknown[], error: null });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Document audiences the caller may see (mirrors audienceMatches), or null for "all of them". */
function allowedAudiences(ctx: NrsContext): DocAudience[] | null {
  if (ctx.isHr) return null;
  const out: DocAudience[] = ["all"];
  if (ctx.isManager) out.push("managers");
  if (ctx.engagementType) out.push(ctx.engagementType);
  return out;
}

export async function GET(req: NextRequest) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs();
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase } = g;

  const q = normalizeQuery(req.nextUrl.searchParams.get("q"));
  if (!q) {
    return NextResponse.json({ error: "Search needs 2 to 80 characters." }, { status: 400 });
  }

  const orgId = ctx.orgId ?? "";
  const member = ctx.member;
  const mOrg = member?.org_id ?? "";
  const mId = member?.id ?? "";
  const like = containsPattern(q);
  const now = new Date().toISOString();

  const wantPeople = !!orgId && canTab("people", ctx);
  const wantDocs = !!member && canTab("knowledge", ctx);
  const wantProjects = !!member && canTab("projects", ctx);
  const wantTickets = !!member && canTab("help", ctx);
  const wantPosts = !!member && canTab("home", ctx);
  const wantKnowledge = !!member && canTab("knowledge", ctx);
  const seeAllProjects = ctx.isHr || ctx.isManager;
  const docCountry = member && /^[A-Za-z]{2}$/.test(member.home_country) ? member.home_country : null;
  const docAudiences = allowedAudiences(ctx);

  // Projects: everyone else only sees projects they own or are on (mirrors the
  // project page). Resolve membership first so the filter runs in the query,
  // before the LIMIT, rather than on a truncated result.
  let projectFilter: string | null = null;
  if (wantProjects && !seeAllProjects) {
    const { data: linkData, error: linkErr } = await supabase
      .from("nrs_project_members")
      .select("project_id")
      .eq("member_id", mId);
    if (linkErr) console.error("[nrs-search] project members:", linkErr.message);
    const ids = ((linkData ?? []) as { project_id: string }[]).map((l) => l.project_id).filter((id) => UUID_RE.test(id));
    projectFilter = ids.length ? `owner_member_id.eq.${mId},id.in.(${ids.join(",")})` : `owner_member_id.eq.${mId}`;
  }

  let docsQuery = supabase
    .from("nrs_documents")
    .select("id, title, category, country_code, audience")
    .eq("org_id", mOrg)
    .is("archived_at", null)
    .ilike("title", like);
  docsQuery = docCountry ? docsQuery.or(`country_code.is.null,country_code.eq.${docCountry}`) : docsQuery.is("country_code", null);
  if (docAudiences) docsQuery = docsQuery.in("audience", docAudiences);

  let projectsQuery = supabase
    .from("nrs_projects")
    .select("id, name, division, status, progress_pct, owner_member_id")
    .eq("org_id", mOrg)
    .is("archived_at", null)
    .ilike("name", like);
  if (projectFilter) projectsQuery = projectsQuery.or(projectFilter);

  let ticketsQuery = supabase.from("nrs_tickets").select("id, title, category, status").eq("org_id", mOrg).ilike("title", like);
  if (!ctx.isHr) ticketsQuery = ticketsQuery.or(`member_id.eq.${mId},assignee_member_id.eq.${mId}`);

  const [peopleR, docsR, projectsR, ticketsR, postsR, valuesR, quickR] = await Promise.allSettled([
    wantPeople
      ? supabase
          .from("nrs_members")
          .select("id, full_name, designation, department, home_country")
          .eq("org_id", orgId)
          .eq("status", "active")
          .is("deleted_at", null)
          .or(orIlike(["full_name", "email", "designation", "department", "home_country"], q))
          .order("full_name", { ascending: true })
          .limit(SEARCH_LIMIT)
      : EMPTY,
    // Audience and country are filtered in the query; the extra headroom only
    // covers documents dropped below for having no published version yet.
    wantDocs ? docsQuery.order("title", { ascending: true }).limit(SEARCH_LIMIT * 2) : EMPTY,
    wantProjects ? projectsQuery.order("name", { ascending: true }).limit(SEARCH_LIMIT) : EMPTY,
    wantTickets ? ticketsQuery.order("created_at", { ascending: false }).limit(SEARCH_LIMIT) : EMPTY,
    wantPosts
      ? supabase
          .from("nrs_posts")
          .select("id, title, kind, published_at")
          .eq("org_id", mOrg)
          .is("deleted_at", null)
          .not("published_at", "is", null)
          .lte("published_at", now)
          .ilike("title", like)
          .order("published_at", { ascending: false })
          .limit(SEARCH_LIMIT)
      : EMPTY,
    wantKnowledge
      ? supabase
          .from("nrs_values")
          .select("id, name, meaning")
          .eq("org_id", mOrg)
          .ilike("name", like)
          .order("sort", { ascending: true })
          .limit(SEARCH_LIMIT)
      : EMPTY,
    wantKnowledge
      ? supabase
          .from("nrs_quick_links")
          .select("id, title, url, description")
          .eq("org_id", mOrg)
          .ilike("title", like)
          .order("sort", { ascending: true })
          .limit(SEARCH_LIMIT)
      : EMPTY,
  ]);

  // People
  const people: SearchItem[] = rows<{
    id: string;
    full_name: string;
    designation: string | null;
    department: string | null;
    home_country: string;
  }>("people", peopleR).map((p) => ({
    id: p.id,
    title: p.full_name,
    subtitle: joinSub(p.designation, p.department, p.home_country),
    href: `${NRS_BASE}/people?member=${encodeURIComponent(p.id)}`,
  }));

  // Documents: audience rule from the Library, and only those with a published version.
  let documents: SearchItem[] = [];
  const docRows = rows<{ id: string; title: string; category: DocCategory; country_code: string | null; audience: DocAudience }>(
    "documents",
    docsR
  ).filter((d) => audienceMatches(d.audience, ctx));
  if (docRows.length) {
    const { data: verData, error: verErr } = await supabase
      .from("nrs_document_versions")
      .select("document_id")
      .in(
        "document_id",
        docRows.map((d) => d.id)
      )
      .not("published_at", "is", null);
    if (verErr) console.error("[nrs-search] document versions:", verErr.message);
    const published = new Set(((verData ?? []) as { document_id: string }[]).map((v) => v.document_id));
    documents = docRows
      .filter((d) => published.has(d.id))
      .map((d) => ({
        id: d.id,
        title: d.title,
        subtitle: joinSub(ks.category[d.category] ?? d.category, d.country_code ?? ks.global),
        href: `${NRS_BASE}/knowledge/doc/${d.id}`,
      }));
  }

  const projects: SearchItem[] = rows<{
    id: string;
    name: string;
    division: string | null;
    status: keyof typeof ps.status;
    progress_pct: number;
    owner_member_id: string;
  }>("projects", projectsR).map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: joinSub(p.division, ps.status[p.status] ?? p.status, s.progress.replace("{pct}", String(p.progress_pct))),
      href: `${NRS_BASE}/projects/${p.id}`,
    }));

  const tickets: SearchItem[] = rows<{ id: string; title: string; category: keyof typeof hs.categories; status: keyof typeof hs.status }>(
    "tickets",
    ticketsR
  ).map((tk) => ({
    id: tk.id,
    title: tk.title,
    subtitle: joinSub(hs.categories[tk.category] ?? tk.category, hs.status[tk.status] ?? tk.status),
    href: `${NRS_BASE}/help/${tk.id}`,
  }));

  const posts: SearchItem[] = rows<{ id: string; title: string; kind: string; published_at: string }>("posts", postsR).map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: joinSub(p.kind.charAt(0).toUpperCase() + p.kind.slice(1), p.published_at.slice(0, 10)),
    href: NRS_BASE,
  }));

  const values: SearchItem[] = rows<{ id: string; name: string; meaning: string }>("values", valuesR).map((v) => ({
    id: v.id,
    title: v.name,
    subtitle: v.meaning.length > 90 ? `${v.meaning.slice(0, 89)}…` : v.meaning,
    href: `${NRS_BASE}/knowledge/joe#nrs-values`,
  }));

  const links: SearchItem[] = rows<{ id: string; title: string; url: string; description: string | null }>("quick links", quickR)
    .filter((l) => /^https:\/\//i.test(l.url))
    .map((l) => {
      let host: string | null = null;
      try {
        host = new URL(l.url).host;
      } catch {
        host = null;
      }
      return { id: l.id, title: l.title, subtitle: l.description || host, href: l.url, external: true };
    });

  const groups = buildGroups(
    {
      actions: matchStatic(q, staticActions(ctx)),
      pages: matchStatic(q, staticPages(ctx)),
      people,
      documents,
      projects,
      tickets,
      posts,
      values,
      links,
    },
    LABELS
  );

  return NextResponse.json({ groups }, { headers: { "Cache-Control": "no-store" } });
}
