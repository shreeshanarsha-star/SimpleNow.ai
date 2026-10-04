import { NextResponse, type NextRequest } from "next/server";
import { requireNrs, type NrsContext } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { search as s } from "@/lib/nrs/i18n/en/search";
import { knowledge as ks } from "@/lib/nrs/i18n/en/knowledge";
import { help as hs } from "@/lib/nrs/i18n/en/help";
import { desk as ds } from "@/lib/nrs/i18n/en/desk";
import { travel as trs } from "@/lib/nrs/i18n/en/travel";
import { formatValue, isProjectStatus } from "@/app/tools/nr-synergy/projects/_lib";
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
  snippetAround,
  stripMarkdown,
  type SearchGroupKey,
  type SearchItem,
  type StaticEntry,
} from "@/lib/nrs/search";
import { loadCurrentDocs, type DocRow, type VersionRow } from "@/app/tools/nr-synergy/knowledge/_lib";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/search?q=  -- the NR Synergy global search.
//
// Every query runs on the caller's own (RLS) client, so row visibility is
// exactly what each module page would show. On top of RLS we apply the same
// page-level rules the target pages use (tab feature switches, document
// audience, approved projects), so a result never links to a "not found".

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
    // Desk tab (agents only, gated by canOpenTab above): also offer each desk directly.
    if (tab.key === "desk") {
      if (ctx.desk.support) {
        out.push({ id: "page-desk-support", title: ds.support.title, keywords: s.pageKeywords.deskSupport, href: `${NRS_BASE}/desk/support`, icon: "headset" });
      }
      if (ctx.desk.travel) {
        out.push({ id: "page-desk-travel", title: trs.desk.title, keywords: s.pageKeywords.deskTravel, href: `${NRS_BASE}/desk/travel`, icon: "globe" });
      }
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

  const projectsQuery = supabase
    .from("nrs_projects")
    .select("id, name, division, status, value_minor, value_currency")
    .eq("org_id", mOrg)
    // Approved projects the caller may see (RLS: own, team member, their manager, HR).
    .eq("approval_status", "approved")
    .is("archived_at", null)
    .ilike("name", like);

  let ticketsQuery = supabase.from("nrs_tickets").select("id, title, category, status").eq("org_id", mOrg).ilike("title", like);
  if (!ctx.isHr) ticketsQuery = ticketsQuery.or(`member_id.eq.${mId},assignee_member_id.eq.${mId}`);

  const [peopleR, docsR, projectsR, ticketsR, postsR, valuesR, quickR, joeR] = await Promise.allSettled([
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
    // Documents: exactly the Library's rules (country, audience, current
    // published version); title and body are matched below in JS so a match
    // in an older or unpublished version never surfaces.
    wantDocs && member ? loadCurrentDocs(supabase, ctx, member, { withBody: true }).then((data) => ({ data, error: null })) : EMPTY,
    wantProjects ? projectsQuery.order("name", { ascending: true }).limit(SEARCH_LIMIT) : EMPTY,
    wantTickets ? ticketsQuery.order("created_at", { ascending: false }).limit(SEARCH_LIMIT) : EMPTY,
    wantPosts
      ? supabase
          .from("nrs_posts")
          .select("id, title, body, kind, published_at")
          .eq("org_id", mOrg)
          .is("deleted_at", null)
          .not("published_at", "is", null)
          .lte("published_at", now)
          .or(orIlike(["title", "body"], q))
          .order("published_at", { ascending: false })
          .limit(SEARCH_LIMIT)
      : EMPTY,
    wantKnowledge
      ? supabase
          .from("nrs_values")
          .select("id, name, meaning")
          .eq("org_id", mOrg)
          .or(orIlike(["name", "meaning"], q))
          .order("sort", { ascending: true })
          .limit(SEARCH_LIMIT)
      : EMPTY,
    wantKnowledge
      ? supabase
          .from("nrs_quick_links")
          .select("id, title, url, description")
          .eq("org_id", mOrg)
          .or(orIlike(["title", "description"], q))
          .order("sort", { ascending: true })
          .limit(SEARCH_LIMIT)
      : EMPTY,
    wantKnowledge
      ? supabase
          .from("nrs_joe_media")
          .select("md_message_title, md_transcript")
          .eq("org_id", mOrg)
          .or(orIlike(["md_message_title", "md_transcript"], q))
          .limit(1)
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

  // Documents: title matches first, then body matches (with a snippet).
  const ql = q.toLowerCase();
  const titleHits: SearchItem[] = [];
  const bodyHits: SearchItem[] = [];
  for (const { doc, version } of rows<{ doc: DocRow; version: VersionRow }>("documents", docsR)) {
    const meta = joinSub(ks.category[doc.category] ?? doc.category, doc.country_code ?? ks.global);
    const href = `${NRS_BASE}/knowledge/doc/${doc.id}`;
    if (doc.title.toLowerCase().includes(ql)) {
      titleHits.push({ id: doc.id, title: doc.title, subtitle: meta, href });
      continue;
    }
    const plain = stripMarkdown([version.summary, version.body_markdown].filter(Boolean).join("\n\n"));
    if (plain.toLowerCase().includes(ql)) {
      bodyHits.push({ id: doc.id, title: doc.title, subtitle: snippetAround(plain, q) ?? meta, href });
    }
  }
  const documents = [...titleHits, ...bodyHits];

  const projects: SearchItem[] = rows<{
    id: string;
    name: string;
    division: string | null;
    status: string;
    value_minor: number | string | null;
    value_currency: string | null;
  }>("projects", projectsR).map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: joinSub(
        p.division,
        isProjectStatus(p.status) ? ps.status[p.status] : p.status,
        formatValue(p.value_minor == null ? null : Number(p.value_minor), p.value_currency)
      ),
      href: `${NRS_BASE}/projects/${p.id}`,
    }));

  const tickets: SearchItem[] = rows<{ id: string; title: string; category: keyof typeof hs.categories; status: string }>(
    "tickets",
    ticketsR
  ).map((tk) => ({
    id: tk.id,
    title: tk.title,
    subtitle: joinSub(hs.categories[tk.category] ?? tk.category, (ds.ticketStatus as Record<string, string>)[tk.status] ?? tk.status),
    href: `${NRS_BASE}/help/${tk.id}`,
  }));

  const posts: SearchItem[] = rows<{ id: string; title: string; body: string | null; kind: string; published_at: string }>(
    "posts",
    postsR
  ).map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.title.toLowerCase().includes(ql)
      ? joinSub(p.kind.charAt(0).toUpperCase() + p.kind.slice(1), p.published_at.slice(0, 10))
      : snippetAround(stripMarkdown(p.body), q) ?? joinSub(p.kind, p.published_at.slice(0, 10)),
    href: NRS_BASE,
  }));

  const values: SearchItem[] = rows<{ id: string; name: string; meaning: string }>("values", valuesR).map((v) => ({
    id: v.id,
    title: v.name,
    subtitle: snippetAround(v.meaning, q) ?? (v.meaning.length > 90 ? `${v.meaning.slice(0, 89)}…` : v.meaning),
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
      const desc = l.description ? stripMarkdown(l.description) : "";
      return { id: l.id, title: l.title, subtitle: (desc && snippetAround(desc, q)) || desc || host, href: l.url, external: true };
    });

  const joe: SearchItem[] = rows<{ md_message_title: string | null; md_transcript: string | null }>("joe", joeR).map((j) => ({
    id: "joe-md-message",
    title: j.md_message_title?.trim() || s.joeMdMessage,
    subtitle: snippetAround(stripMarkdown(j.md_transcript), q) ?? s.joeMdMessage,
    href: `${NRS_BASE}/knowledge/joe`,
  }));

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
      joe,
      links,
    },
    LABELS
  );

  return NextResponse.json({ groups }, { headers: { "Cache-Control": "no-store" } });
}
