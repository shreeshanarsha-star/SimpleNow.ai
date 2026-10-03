import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import NrsState from "../../_components/NrsState";
import { gatePage } from "../../_home/gate";
import { isUuid, listOrgMembers, memberNames, memberTimezone, mondayInTz } from "../../_home/server";
import { Card, EmptyLine, Pill, ProgressBar, SectionTitle, fill, fmtDate, linkClass } from "../../_home/ui";
import { PROJECT_COLUMNS, STATUS_TONE, UPDATE_COLUMNS, type ProjectRow, type ProjectUpdateRow } from "../_lib";
import ProjectUpdateForm from "./ProjectUpdateForm";

export default async function NrSynergyProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const { id } = await params;
  const supabase = await createClient();

  const notFound = (
    <div className="flex flex-col">
      <Link href="/tools/nr-synergy/projects" className={`${linkClass} text-[12.5px] self-start`}>
        ← {s.back}
      </Link>
      <NrsState icon="chart" title={s.notFound} />
    </div>
  );
  if (!isUuid(id)) return notFound;

  const { data: projData, error: projErr } = await supabase
    .from("nrs_projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (projErr) throw new Error(projErr.message);
  const project = projData as ProjectRow | null;
  if (!project) return notFound;

  const { data: link } = await supabase
    .from("nrs_project_members")
    .select("member_id")
    .eq("project_id", project.id)
    .eq("member_id", member.id)
    .maybeSingle();
  const isOwner = project.owner_member_id === member.id;
  const onProject = isOwner || !!link;
  if (!onProject && !ctx.isHr && !ctx.isManager) return notFound;

  const tz = await memberTimezone(supabase, member);
  const weekOf = mondayInTz(tz);

  const [{ data: histData, error: histErr }, people] = await Promise.all([
    supabase
      .from("nrs_project_updates")
      .select(UPDATE_COLUMNS)
      .eq("project_id", project.id)
      .order("week_of", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60),
    onProject ? listOrgMembers(supabase, member.org_id) : Promise.resolve([]),
  ]);
  if (histErr) throw new Error(histErr.message);
  const history = (histData ?? []) as ProjectUpdateRow[];
  const mine = history.find((u) => u.member_id === member.id && u.week_of === weekOf) ?? null;
  const names = await memberNames(supabase, [
    project.owner_member_id,
    ...history.map((u) => u.member_id),
    ...history.map((u) => u.help_needed_member_id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/tools/nr-synergy/projects" className={`${linkClass} text-[12.5px] self-start`}>
        ← {s.back}
      </Link>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[20px] sm:text-[24px] font-bold text-ink tracking-tight">{project.name}</h1>
            <p className="text-[12.5px] text-ink-muted">
              {fill(s.ownerLabel, { name: names.get(project.owner_member_id) ?? "" })}
              {project.division ? ` · ${project.division}` : ""}
            </p>
          </div>
          <Pill tone={STATUS_TONE[project.status]}>{s.status[project.status]}</Pill>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[12px] text-ink-2">
            <span>{s.progress}</span>
            <span>{fill(s.progressPct, { pct: project.progress_pct })}</span>
          </div>
          <ProgressBar pct={project.progress_pct} label={s.progress} />
        </div>
        <p className="text-[12.5px] text-ink-2">
          <span className="font-bold">{s.nextMilestone}: </span>
          {project.next_milestone
            ? `${project.next_milestone}${project.next_milestone_on ? ` (${fmtDate(project.next_milestone_on)})` : ""}`
            : s.noMilestone}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {onProject && (
          <Card labelledBy="nrs-update-title">
            <SectionTitle id="nrs-update-title" aside={<span className="text-[12px] text-ink-muted">{fill(s.form.weekOf, { date: fmtDate(weekOf) })}</span>}>
              {s.form.title}
            </SectionTitle>
            <ProjectUpdateForm
              projectId={project.id}
              isOwner={isOwner}
              currentPct={project.progress_pct}
              people={people.filter((p) => p.id !== member.id)}
              initial={
                mine
                  ? {
                      status: mine.status,
                      progress: mine.progress,
                      challenges: mine.challenges ?? "",
                      plan_of_action: mine.plan_of_action ?? "",
                      help_needed_member_id: mine.help_needed_member_id ?? "",
                      next_milestone: mine.next_milestone ?? "",
                      next_milestone_on: mine.next_milestone_on ?? "",
                    }
                  : {
                      status: project.status,
                      progress: "",
                      challenges: "",
                      plan_of_action: "",
                      help_needed_member_id: "",
                      next_milestone: project.next_milestone ?? "",
                      next_milestone_on: project.next_milestone_on ?? "",
                    }
              }
              editing={!!mine}
            />
          </Card>
        )}

        <Card labelledBy="nrs-history-title" className={onProject ? "" : "lg:col-span-2"}>
          <SectionTitle id="nrs-history-title">{s.history.title}</SectionTitle>
          {history.length === 0 ? (
            <EmptyLine>{s.history.empty}</EmptyLine>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {history.map((u) => (
                <li key={u.id} className="py-3 first:pt-0 flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12.5px] font-bold text-ink">
                      {fill(s.history.by, { name: names.get(u.member_id) ?? "", date: fmtDate(u.week_of) })}
                    </p>
                    <Pill tone={STATUS_TONE[u.status]}>{s.status[u.status]}</Pill>
                  </div>
                  <p className="text-[13px] text-ink-2 whitespace-pre-line break-words">{u.progress}</p>
                  {u.challenges && (
                    <p className="text-[12.5px] text-ink-2 whitespace-pre-line break-words">
                      <span className="font-bold">{s.history.challenges}: </span>
                      {u.challenges}
                    </p>
                  )}
                  {u.plan_of_action && (
                    <p className="text-[12.5px] text-ink-2 whitespace-pre-line break-words">
                      <span className="font-bold">{s.history.plan}: </span>
                      {u.plan_of_action}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {u.help_needed_member_id && (
                      <Pill tone="warning">{fill(s.history.help, { name: names.get(u.help_needed_member_id) ?? "" })}</Pill>
                    )}
                    {u.next_milestone && (
                      <Pill>
                        {fill(s.history.milestone, {
                          name: `${u.next_milestone}${u.next_milestone_on ? ` (${fmtDate(u.next_milestone_on)})` : ""}`,
                        })}
                      </Pill>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
