import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { callTextModel, hasAiKey } from "@/lib/aiClient";
import { requireNrs, type NrsContext, type NrsMember } from "@/lib/nrs/member";
import { canOpenTab, NRS_BASE, nrsTab } from "@/lib/nrs/tabs";
import { search as s } from "@/lib/nrs/i18n/en/search";
import {
  ASK_MAX,
  ASK_SYSTEM_PROMPT,
  ASK_TOP_K,
  WEB_SOURCES_PROMPT,
  WEB_SYSTEM_PROMPT,
  buildAskPrompt,
  chunkMarkdown,
  chunkPlainText,
  citedSources,
  isNotFound,
  isPersonalTopic,
  normalizeCitations,
  normalizeQuestion,
  rankChunks,
  type AskResponse,
  type AskSource,
  type KnowledgeChunk,
} from "@/lib/nrs/ask";
import { stripMarkdown } from "@/lib/nrs/search";
import { formatMoney } from "@/lib/nrs/money";
import { NRS_BUCKET } from "@/lib/nrs/invoice/kit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCurrentDocs } from "@/app/tools/nr-synergy/knowledge/_lib";
import { loadLeaveBalances } from "@/app/tools/nr-synergy/time/_lib/balances";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// POST /api/nr-synergy/search/ask  {question}  -> {answer, sources}
//
// 1. Internal first. Retrieval-augmented answers from what the caller may
//    already read: current published documents (same country + audience
//    rules as Knowledge) including the text of their PDFs, values, the JOE
//    MD message, quick links, and the caller's OWN records (profile,
//    contract terms, leave balance). Nobody else's contract, fee or leave is
//    ever loaded: personal rows are fetched with member_id = the caller.
// 2. Web second. Only when company knowledge has no answer, the question
//    isn't about pay / contracts / personal data, and the Anthropic web
//    search tool is available. Web answers are labelled and cite their URLs.

const AI_TIMEOUT_MS = 30_000;
const WEB_TIMEOUT_MS = 45_000;
const PDF_MAX_BYTES = 25 * 1024 * 1024;
const PDF_MAX_CHARS = 400_000;
const MAX_TOKENS = 450;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

// Simple per-user, per-instance sliding window. Good enough to stop a stuck
// key or a loop; not a security boundary.
const hits = new Map<string, number[]>();

function rateLimited(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return false;
}

function askModel(): string {
  return process.env.NRS_ASK_MODEL || "claude-sonnet-4-5";
}

async function askClaude(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const msg = await client.messages.create({
    model: askModel(),
    max_tokens: MAX_TOKENS,
    system: ASK_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("The model returned an empty response.");
  return text;
}

/**
 * Public-web answer with Claude's web search tool. Text blocks carry
 * citations; each distinct URL becomes a numbered source and the number is
 * appended after the sentence that cites it.
 */
async function askWeb(question: string): Promise<{ answer: string; sources: AskSource[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: WEB_TIMEOUT_MS, maxRetries: 1 });
  const msg = await client.messages.create({
    model: askModel(),
    max_tokens: 700,
    system: WEB_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    messages: [{ role: "user", content: question }],
  });
  const sources: AskSource[] = [];
  const numberOf = (url: string, title: string): number => {
    const found = sources.find((x) => x.href === url);
    if (found) return found.n;
    const n = sources.length + 1;
    sources.push({ n, title: title || url, href: url, external: true });
    return n;
  };
  let answer = "";
  for (const block of msg.content) {
    if (block.type !== "text") continue;
    const cites = new Set<number>();
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location" && /^https:\/\//i.test(c.url)) cites.add(numberOf(c.url, c.title ?? ""));
    }
    answer += block.text + [...cites].map((n) => `[${n}]`).join("");
  }
  answer = answer.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!answer) throw new Error("The web search returned no answer.");
  return { answer, sources };
}

async function askTextModel(prompt: string, system = ASK_SYSTEM_PROMPT): Promise<string> {
  return callTextModel(`${system}\n\n${prompt}`, MAX_TOKENS, AI_TIMEOUT_MS);
}

// When the Anthropic key is rejected (e.g. not scoped to a workspace) skip
// Claude for a while instead of paying a failed round trip on every question.
let claudeDownUntil = 0;
const CLAUDE_BACKOFF_MS = 10 * 60_000;

function claudeUsable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.NRS_ASK_PROVIDER !== "openai" && Date.now() >= claudeDownUntil;
}

function markClaudeDown(err: unknown) {
  claudeDownUntil = Date.now() + CLAUDE_BACKOFF_MS;
  console.error("[nrs-ask] claude unavailable, using fallback:", err instanceof Error ? err.message : err);
}

/** Company-knowledge answer: Claude first, OpenAI if Claude isn't usable. */
async function answerInternal(prompt: string): Promise<string> {
  if (claudeUsable()) {
    try {
      return await askClaude(prompt);
    } catch (err) {
      if (!hasAiKey()) throw err;
      markClaudeDown(err);
    }
  }
  return askTextModel(prompt);
}

/** Web results from Serper (Google), as numbered chunks. */
async function serperResults(question: string): Promise<KnowledgeChunk[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: question, num: 6 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Serper ${res.status}`);
    const json = (await res.json()) as {
      answerBox?: { title?: string; answer?: string; snippet?: string; link?: string };
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    const out: KnowledgeChunk[] = [];
    const ab = json.answerBox;
    if (ab && (ab.answer || ab.snippet) && ab.link && /^https:\/\//i.test(ab.link)) {
      out.push({ id: "web-ab", title: ab.title || ab.link, text: [ab.answer, ab.snippet].filter(Boolean).join(" — "), href: ab.link, external: true });
    }
    for (const [i, o] of (json.organic ?? []).entries()) {
      if (!o.link || !/^https:\/\//i.test(o.link) || !o.snippet) continue;
      out.push({ id: `web-${i}`, title: o.title || o.link, text: o.snippet, href: o.link, external: true });
    }
    return out.slice(0, 6);
  } finally {
    clearTimeout(timer);
  }
}

/** Public-web answer: Claude's web search tool, else Serper results + the text model. */
async function answerWeb(question: string): Promise<{ answer: string; sources: AskSource[] } | null> {
  if (claudeUsable()) {
    try {
      return await askWeb(question);
    } catch (err) {
      markClaudeDown(err);
    }
  }
  if (!hasAiKey()) return null;
  const results = await serperResults(question);
  if (!results.length) return null;
  const answer = normalizeCitations(await askTextModel(buildAskPrompt(question, results), WEB_SOURCES_PROMPT));
  if (isNotFound(answer)) return null;
  return { answer, sources: citedSources(answer, results) };
}

// Extracted PDF text per document version (versions are immutable once published).
const pdfCache = new Map<string, string>();

async function pdfText(versionId: string, path: string): Promise<string> {
  const hit = pdfCache.get(versionId);
  if (hit !== undefined) return hit;
  let text = "";
  try {
    const { data, error } = await createAdminClient().storage.from(NRS_BUCKET).download(path);
    if (error || !data) throw new Error(error?.message ?? "missing file");
    if (data.size <= PDF_MAX_BYTES) {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(Buffer.from(await data.arrayBuffer()));
      text = parsed.text.replace(/[ \t]+\n/g, "\n").trim().slice(0, PDF_MAX_CHARS);
    }
  } catch (e) {
    console.error("[nrs-ask] pdf:", path, e instanceof Error ? e.message : e);
  }
  if (pdfCache.size > 200) pdfCache.clear();
  pdfCache.set(versionId, text);
  return text;
}

/**
 * The caller's own records only (never anyone else's): profile, engagement,
 * current verified contract terms and this year's leave balance.
 */
async function loadMine(ctx: NrsContext, member: NrsMember): Promise<KnowledgeChunk[]> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const out: KnowledgeChunk[] = [];
  const [mgrR, engR, termsR, balR] = await Promise.allSettled([
    member.manager_id
      ? admin.from("nrs_members").select("full_name, designation").eq("id", member.manager_id).eq("org_id", member.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("nrs_engagements")
      .select("type, starts_on, ends_on")
      .eq("org_id", member.org_id)
      .eq("member_id", member.id)
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .limit(3),
    admin
      .from("nrs_contract_terms")
      .select("effective_from, effective_to, basis, fee_minor, currency, paid_leave_days_per_year, reimbursables, notice_days")
      .eq("org_id", member.org_id)
      .eq("member_id", member.id)
      .not("verified_at", "is", null)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1),
    loadLeaveBalances(
      admin,
      member.org_id,
      [{ id: member.id, home_country: member.home_country, joined_on: member.joined_on, left_on: member.left_on }],
      [year]
    ),
  ]);

  const mgr = mgrR.status === "fulfilled" ? (mgrR.value.data as { full_name: string; designation: string | null } | null) : null;
  out.push({
    id: "me-profile",
    title: s.ask.myProfile,
    text: [
      `Name: ${member.full_name}.`,
      member.designation ? `Designation: ${member.designation}.` : "",
      member.department ? `Department: ${member.department}.` : "",
      member.division ? `Division: ${member.division}.` : "",
      `Home country: ${member.home_country}.`,
      member.joined_on ? `Joined on ${member.joined_on}.` : "",
      mgr ? `Reporting manager: ${mgr.full_name}${mgr.designation ? ` (${mgr.designation})` : ""}.` : "Reporting manager: not set.",
      `Roles: ${ctx.roles.join(", ") || "employee"}.`,
    ]
      .filter(Boolean)
      .join(" "),
    href: `${NRS_BASE}/people`,
  });

  const engs = engR.status === "fulfilled" && !engR.value.error ? ((engR.value.data ?? []) as { type: string; starts_on: string; ends_on: string | null }[]) : [];
  if (engs.length) {
    out.push({
      id: "me-engagement",
      title: s.ask.myEngagement,
      text: engs.map((e) => `${e.type === "payroll" ? "Payroll employee" : "Consultant"} from ${e.starts_on}${e.ends_on ? ` to ${e.ends_on}` : " (ongoing)"}.`).join(" "),
      href: `${NRS_BASE}/time`,
    });
  }

  const terms =
    termsR.status === "fulfilled" && !termsR.value.error
      ? ((termsR.value.data ?? []) as {
          effective_from: string;
          effective_to: string | null;
          basis: string;
          fee_minor: number | string;
          currency: string;
          paid_leave_days_per_year: number | string;
          reimbursables: string[] | null;
          notice_days: number | null;
        }[])[0]
      : undefined;
  if (terms && (!terms.effective_to || terms.effective_to >= today)) {
    let fee = `${terms.fee_minor} ${terms.currency}`;
    try {
      fee = formatMoney(Number(terms.fee_minor), terms.currency);
    } catch {
      // keep the raw figure
    }
    const basis = terms.basis === "monthly_retainer" ? "monthly retainer" : terms.basis === "day_rate" ? "day rate" : "pro-rata by working days";
    out.push({
      id: "me-contract",
      title: s.ask.myContract,
      text: [
        `Fee: ${fee} (${basis}), effective from ${terms.effective_from}${terms.effective_to ? ` to ${terms.effective_to}` : ""}.`,
        `Paid leave: ${Number(terms.paid_leave_days_per_year)} days per year.`,
        terms.notice_days != null ? `Notice period: ${terms.notice_days} days.` : "",
        terms.reimbursables?.length ? `Reimbursable: ${terms.reimbursables.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      href: `${NRS_BASE}/money`,
    });
  }

  const bal = balR.status === "fulfilled" ? balR.value.get(member.id)?.get(year) : undefined;
  if (bal) {
    const lines = (["annual", "sick", "personal"] as const)
      .map((t) => {
        const b = bal.byType[t];
        if (!b || b.entitlement == null) return "";
        return `${t[0].toUpperCase()}${t.slice(1)} leave ${year}: ${b.remaining ?? 0} of ${b.entitlement} days left (${b.used} used${b.pending ? `, ${b.pending} pending` : ""}).`;
      })
      .filter(Boolean);
    if (lines.length) {
      out.push({ id: "me-leave", title: s.ask.myLeave, text: lines.join(" "), href: `${NRS_BASE}/time` });
    }
  }
  return out;
}

/** Every knowledge chunk the caller may read, from their own org only. */
async function loadKnowledge(supabase: SupabaseClient, ctx: NrsContext, member: NrsMember): Promise<KnowledgeChunk[]> {
  const orgId = member.org_id;
  const [docsR, valuesR, joeR, linksR, mineR] = await Promise.allSettled([
    loadCurrentDocs(supabase, ctx, member, { withBody: true }),
    supabase.from("nrs_values").select("id, name, meaning, behaviours").eq("org_id", orgId).order("sort", { ascending: true }),
    supabase.from("nrs_joe_media").select("md_message_title, md_transcript").eq("org_id", orgId).maybeSingle(),
    supabase.from("nrs_quick_links").select("id, title, url, description").eq("org_id", orgId).order("sort", { ascending: true }),
    loadMine(ctx, member),
  ]);
  const chunks: KnowledgeChunk[] = [];

  if (docsR.status === "fulfilled") {
    const pdfs = await Promise.all(
      docsR.value.map(({ version }) => (version.file_path && /\.pdf$/i.test(version.file_path) ? pdfText(version.id, version.file_path) : Promise.resolve("")))
    );
    docsR.value.forEach(({ doc, version }, i) => {
      const base = { id: `doc-${doc.id}`, title: doc.title, href: `${NRS_BASE}/knowledge/doc/${doc.id}` };
      const body = [version.summary ? `${version.summary}\n` : "", version.body_markdown ?? ""].join("\n");
      chunks.push(...chunkMarkdown(base, body));
      if (pdfs[i]) chunks.push(...chunkPlainText({ id: `pdf-${doc.id}`, title: `${doc.title} (PDF)`, href: base.href }, pdfs[i]));
    });
  } else {
    console.error("[nrs-ask] documents:", docsR.reason);
  }

  if (valuesR.status === "fulfilled" && !valuesR.value.error) {
    for (const v of (valuesR.value.data ?? []) as { id: string; name: string; meaning: string; behaviours: string[] | null }[]) {
      const behaviours = (v.behaviours ?? []).filter(Boolean);
      chunks.push({
        id: `value-${v.id}`,
        title: `${s.ask.valuePrefix}: ${v.name}`,
        text: [v.meaning, behaviours.length ? `${s.ask.behaviours}: ${behaviours.join("; ")}` : ""].filter(Boolean).join(" "),
        href: `${NRS_BASE}/knowledge/joe#nrs-values`,
      });
    }
  } else {
    console.error("[nrs-ask] values:", valuesR.status === "rejected" ? valuesR.reason : valuesR.value.error?.message);
  }

  if (joeR.status === "fulfilled" && !joeR.value.error) {
    const j = joeR.value.data as { md_message_title: string | null; md_transcript: string | null } | null;
    if (j?.md_transcript?.trim()) {
      chunks.push(
        ...chunkMarkdown(
          { id: "joe-md", title: j.md_message_title?.trim() || s.ask.mdMessage, href: `${NRS_BASE}/knowledge/joe` },
          j.md_transcript
        )
      );
    }
  } else {
    console.error("[nrs-ask] joe:", joeR.status === "rejected" ? joeR.reason : joeR.value.error?.message);
  }

  if (linksR.status === "fulfilled" && !linksR.value.error) {
    for (const l of (linksR.value.data ?? []) as { id: string; title: string; url: string; description: string | null }[]) {
      if (!/^https:\/\//i.test(l.url)) continue;
      chunks.push({
        id: `link-${l.id}`,
        title: `${s.ask.linkPrefix}: ${l.title}`,
        text: [l.title, stripMarkdown(l.description), l.url].filter(Boolean).join(" — "),
        href: l.url,
        external: true,
      });
    }
  } else {
    console.error("[nrs-ask] quick links:", linksR.status === "rejected" ? linksR.reason : linksR.value.error?.message);
  }

  if (mineR.status === "fulfilled") chunks.push(...mineR.value);
  else console.error("[nrs-ask] own records:", mineR.reason);

  return chunks;
}

export async function POST(req: NextRequest) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs("search_ai");
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase, user } = g;
  const member = ctx.member;
  if (!member || !canOpenTab(nrsTab("knowledge"), ctx)) {
    return NextResponse.json({ error: s.ask.noAccess }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = normalizeQuestion(body?.question);
  if (!question) {
    return NextResponse.json({ error: `Ask a question of 3 to ${ASK_MAX} characters.` }, { status: 400 });
  }

  const useClaude = !!process.env.ANTHROPIC_API_KEY;
  if (!useClaude && !hasAiKey()) {
    return NextResponse.json({ error: s.ask.notConfigured }, { status: 503 });
  }

  if (rateLimited(user.id)) {
    return NextResponse.json({ error: s.ask.rateLimited }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const headers = { "Cache-Control": "no-store" };
  const personal = isPersonalTopic(question);
  const top = rankChunks(question, await loadKnowledge(supabase, ctx, member), ASK_TOP_K);

  // 1. Company knowledge first.
  if (top.length) {
    let answer: string;
    try {
      const prompt = buildAskPrompt(question, top);
      answer = normalizeCitations(await answerInternal(prompt));
    } catch (err) {
      console.error("[nrs-ask] model:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: s.ask.failed }, { status: 502 });
    }
    if (!isNotFound(answer)) {
      const out: AskResponse = { answer, sources: citedSources(answer, top), origin: "internal" };
      return NextResponse.json(out, { headers });
    }
  }

  // Pay, contracts and personal data never go to the web.
  if (personal) {
    const out: AskResponse = { answer: s.ask.privateOnly, sources: [], origin: "none" };
    return NextResponse.json(out, { headers });
  }

  // 2. Then the public web: Claude's web search tool, else Serper + text model.
  if (process.env.NRS_ASK_WEB !== "off") {
    try {
      const web = await answerWeb(question);
      if (web) {
        const out: AskResponse = { answer: normalizeCitations(web.answer), sources: web.sources, origin: "web" };
        return NextResponse.json(out, { headers });
      }
    } catch (err) {
      console.error("[nrs-ask] web:", err instanceof Error ? err.message : err);
    }
  }

  const out: AskResponse = { answer: s.ask.notFound, sources: [], origin: "none" };
  return NextResponse.json(out, { headers });
}
