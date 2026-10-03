import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import Icon from "@/components/Icon";
import type { NrsContext, NrsMember } from "@/lib/nrs/member";
import { home as s } from "@/lib/nrs/i18n/en/home";
import { loadLibrary } from "../knowledge/_lib";
import { memberNames, mondayInTz } from "./server";
import { Card, EmptyLine, ErrorLine, SectionTitle, fill, fmtDateTime } from "./ui";

interface NeedItem {
  key: string;
  icon: string;
  title: string;
  detail?: string;
  href: string;
}

const MAX_APPROVALS = 5;

async function approvalItems(supabase: SupabaseClient, ctx: NrsContext, member: NrsMember): Promise<{ items: NeedItem[]; more: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const [stepsRes, delRes] = await Promise.all([
    supabase
      .from("nrs_request_steps")
      .select("id, request_id, approver_type, approver_role, approver_member_id")
      .eq("org_id", member.org_id)
      .eq("status", "pending")
      .limit(500),
    supabase
      .from("nrs_delegations")
      .select("member_id")
      .eq("delegate_member_id", member.id)
      .lte("starts_on", today)
      .gte("ends_on", today),
  ]);
  if (stepsRes.error) throw new Error(stepsRes.error.message);
  const delegatedFrom = new Set(((delRes.data ?? []) as { member_id: string }[]).map((d) => d.member_id));
  const isSuper = ctx.isPlatformAdmin || ctx.roles.includes("super_admin");
  const holdsRole = (role: string | null) => !!role && (isSuper || ctx.roles.includes(role as NrsContext["roles"][number]));

  const steps = (
    (stepsRes.data ?? []) as {
      id: string;
      request_id: string;
      approver_type: "manager" | "role" | "member";
      approver_role: string | null;
      approver_member_id: string | null;
    }[]
  ).filter(
    (st) =>
      st.approver_member_id === member.id ||
      (st.approver_type === "role" && holdsRole(st.approver_role)) ||
      (!!st.approver_member_id && delegatedFrom.has(st.approver_member_id))
  );
  if (!steps.length) return { items: [], more: 0 };

  const { data: reqData, error: reqErr } = await supabase
    .from("nrs_requests")
    .select("id, title, member_id, status, created_at")
    .in(
      "id",
      steps.map((st) => st.request_id)
    )
    .eq("status", "pending")
    .neq("member_id", member.id)
    .order("created_at", { ascending: true });
  if (reqErr) throw new Error(reqErr.message);
  const requests = (reqData ?? []) as { id: string; title: string; member_id: string }[];
  const names = await memberNames(
    supabase,
    requests.slice(0, MAX_APPROVALS).map((r) => r.member_id)
  );
  return {
    items: requests.slice(0, MAX_APPROVALS).map((r) => ({
      key: `req-${r.id}`,
      icon: "check",
      title: fill(s.needs.approval, { title: r.title }),
      detail: fill(s.needs.approvalFrom, { name: names.get(r.member_id) ?? "" }),
      href: "/tools/nr-synergy/team",
    })),
    more: Math.max(0, requests.length - MAX_APPROVALS),
  };
}

async function ackItems(supabase: SupabaseClient, ctx: NrsContext, member: NrsMember): Promise<NeedItem[]> {
  const docs = await loadLibrary(supabase, ctx, member, { requiresAckOnly: true });
  return docs
    .filter((d) => !d.ackedAt)
    .map((d) => ({
      key: `doc-${d.id}`,
      icon: "book",
      title: fill(s.needs.ack, { title: d.title }),
      href: `/tools/nr-synergy/knowledge/doc/${d.id}`,
    }));
}

async function projectItems(supabase: SupabaseClient, member: NrsMember, tz: string): Promise<NeedItem[]> {
  const { data: links, error: lErr } = await supabase.from("nrs_project_members").select("project_id").eq("member_id", member.id);
  if (lErr) throw new Error(lErr.message);
  const ids = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id);
  let q = supabase
    .from("nrs_projects")
    .select("id, name")
    .eq("org_id", member.org_id)
    .is("archived_at", null)
    .neq("status", "completed");
  q = ids.length ? q.or(`owner_member_id.eq.${member.id},id.in.(${ids.join(",")})`) : q.eq("owner_member_id", member.id);
  const { data: projData, error: pErr } = await q.order("name", { ascending: true });
  if (pErr) throw new Error(pErr.message);
  const projects = (projData ?? []) as { id: string; name: string }[];
  if (!projects.length) return [];

  const { data: ups, error: uErr } = await supabase
    .from("nrs_project_updates")
    .select("project_id")
    .eq("member_id", member.id)
    .eq("week_of", mondayInTz(tz))
    .in(
      "project_id",
      projects.map((p) => p.id)
    );
  if (uErr) throw new Error(uErr.message);
  const done = new Set(((ups ?? []) as { project_id: string }[]).map((u) => u.project_id));
  return projects
    .filter((p) => !done.has(p.id))
    .map((p) => ({
      key: `proj-${p.id}`,
      icon: "chart",
      title: fill(s.needs.projectUpdate, { name: p.name }),
      href: `/tools/nr-synergy/projects/${p.id}`,
    }));
}

async function checkInItems(supabase: SupabaseClient, member: NrsMember, tz: string): Promise<NeedItem[]> {
  const { data, error } = await supabase
    .from("nrs_work_logs")
    .select("id, check_in_at, timezone")
    .eq("member_id", member.id)
    .is("check_out_at", null)
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const log = data as { id: string; check_in_at: string; timezone: string | null } | null;
  if (!log) return [];
  return [
    {
      key: `log-${log.id}`,
      icon: "clock",
      title: fill(s.needs.openCheckIn, { time: fmtDateTime(log.check_in_at, log.timezone || tz) }),
      detail: s.needs.openCheckInBody,
      href: "/tools/nr-synergy/time",
    },
  ];
}

export default async function NeedsYou({
  supabase,
  ctx,
  member,
  tz,
}: {
  supabase: SupabaseClient;
  ctx: NrsContext;
  member: NrsMember;
  tz: string;
}) {
  let items: NeedItem[] = [];
  let more = 0;
  let failed = false;
  const settled = await Promise.allSettled([
    approvalItems(supabase, ctx, member),
    ctx.features.knowledge ? ackItems(supabase, ctx, member) : Promise.resolve([]),
    ctx.features.projects ? projectItems(supabase, member, tz) : Promise.resolve([]),
    ctx.features.time ? checkInItems(supabase, member, tz) : Promise.resolve([]),
  ]);
  const [appr, acks, projs, logs] = settled;
  if (appr.status === "fulfilled") {
    items = items.concat(appr.value.items);
    more = appr.value.more;
  }
  for (const r of [logs, acks, projs]) {
    if (r.status === "fulfilled") items = items.concat(r.value);
  }
  failed = settled.some((r) => r.status === "rejected");
  for (const r of settled) if (r.status === "rejected") console.error("[nrs] needs-you", r.reason);

  return (
    <Card labelledBy="nrs-needs">
      <SectionTitle id="nrs-needs">{s.needs.title}</SectionTitle>
      {failed && (
        <div className="mb-2">
          <ErrorLine>{s.sectionError}</ErrorLine>
        </div>
      )}
      {items.length === 0 && !failed ? (
        <EmptyLine>{s.needs.empty}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className="flex items-center gap-3 rounded-sm border border-border px-3 py-2.5 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="w-8 h-8 shrink-0 rounded-full bg-brand-wash text-brand flex items-center justify-center" aria-hidden="true">
                  <Icon name={it.icon} className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-ink break-words">{it.title}</span>
                  {it.detail && <span className="block text-[11.5px] text-ink-muted break-words">{it.detail}</span>}
                </span>
                <span className="text-[12px] font-bold text-brand-dark shrink-0">{s.needs.go}</span>
              </Link>
            </li>
          ))}
          {more > 0 && (
            <li>
              <Link href="/tools/nr-synergy/team" className="text-[12.5px] font-bold text-brand-dark hover:underline px-1">
                {fill(s.needs.approvalsMore, { count: more })}
              </Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
