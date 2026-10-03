import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import NrsState from "../_components/NrsState";
import { gatePage } from "../_home/gate";
import { memberNames, memberTimezone, mondayInTz } from "../_home/server";
import { Card, PageHeader, Pill, ProgressBar, fill, fmtDate } from "../_home/ui";
import { PROJECT_COLUMNS, STATUS_TONE, type ProjectRow } from "./_lib";

export default async function NrSynergyProjectsPage() {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { member } = gate;
  const supabase = await createClient();

  const { data: links, error: linkErr } = await supabase
    .from("nrs_project_members")
    .select("project_id")
    .eq("member_id", member.id);
  if (linkErr) throw new Error(linkErr.message);
  const memberOf = new Set(((links ?? []) as { project_id: string }[]).map((l) => l.project_id));

  let query = supabase.from("nrs_projects").select(PROJECT_COLUMNS).eq("org_id", member.org_id).is("archived_at", null);
  query = memberOf.size
    ? query.or(`owner_member_id.eq.${member.id},id.in.(${Array.from(memberOf).join(",")})`)
    : query.eq("owner_member_id", member.id);
  const { data: projData, error: projErr } = await query.order("name", { ascending: true });
  if (projErr) throw new Error(projErr.message);
  const list = (projData ?? []) as ProjectRow[];

  const tz = await memberTimezone(supabase, member);
  const weekOf = mondayInTz(tz);
  const updated = new Set<string>();
  if (list.length) {
    const { data: ups } = await supabase
      .from("nrs_project_updates")
      .select("project_id")
      .eq("member_id", member.id)
      .eq("week_of", weekOf)
      .in(
        "project_id",
        list.map((p) => p.id)
      );
    for (const u of (ups ?? []) as { project_id: string }[]) updated.add(u.project_id);
  }
  const owners = await memberNames(
    supabase,
    list.map((p) => p.owner_member_id)
  );

  return (
    <div className="flex flex-col">
      <PageHeader title={s.title} subtitle={s.subtitle} />
      {list.length === 0 ? (
        <NrsState icon="chart" title={s.empty} body={s.emptyBody} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((p) => {
            const isOwner = p.owner_member_id === member.id;
            const done = updated.has(p.id);
            return (
              <Card as="li" key={p.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-bold text-ink truncate">{p.name}</h2>
                    <p className="text-[12px] text-ink-muted truncate">
                      {isOwner ? s.owner : fill(s.ownerLabel, { name: owners.get(p.owner_member_id) ?? "" })}
                      {p.division ? ` · ${p.division}` : ""}
                    </p>
                  </div>
                  <Pill tone={STATUS_TONE[p.status]}>{s.status[p.status]}</Pill>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[12px] text-ink-2">
                    <span>{s.progress}</span>
                    <span>{fill(s.progressPct, { pct: p.progress_pct })}</span>
                  </div>
                  <ProgressBar pct={p.progress_pct} label={s.progress} />
                </div>
                <p className="text-[12.5px] text-ink-2">
                  <span className="font-bold">{s.nextMilestone}: </span>
                  {p.next_milestone
                    ? `${p.next_milestone}${p.next_milestone_on ? ` (${fmtDate(p.next_milestone_on)})` : ""}`
                    : s.noMilestone}
                </p>
                <div className="flex items-center justify-between gap-2 mt-auto">
                  {p.status === "completed" ? (
                    <span />
                  ) : (
                    <Pill tone={done ? "good" : "warning"}>{done ? s.updatedThisWeek : s.updateDue}</Pill>
                  )}
                  <Link
                    href={`/tools/nr-synergy/projects/${p.id}`}
                    className="inline-flex items-center gap-1.5 border border-border bg-surface text-ink-2 text-[12.5px] font-bold px-3 py-1.5 rounded-sm hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label={`${s.open}: ${p.name}`}
                  >
                    {s.open}
                  </Link>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
