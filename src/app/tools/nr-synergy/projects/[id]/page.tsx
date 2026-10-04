import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import NrsState from "../../_components/NrsState";
import { gatePage } from "../../_home/gate";
import { isUuid, listOrgMembers, memberTimezone } from "../../_home/server";
import { Card, EmptyLine, Pill, SectionTitle, fill, fmtDate, fmtDateTime, linkClass, secondaryButtonClass } from "../../_home/ui";
import {
  APPROVAL_TONE,
  PROJECT_COLUMNS,
  STATUS_TONE,
  UPDATE_COLUMNS,
  formatValue,
  isUpdateOverdue,
  normaliseProject,
  type ProjectRow,
  type ProjectUpdateRow,
} from "../_lib";
import { canManageProject, latestUpdates, loadMySubmissions, memberInfo, projectMemberIds } from "../_server";
import ArchiveButton from "./ArchiveButton";
import ProjectUpdateForm from "./ProjectUpdateForm";
import StatusRequestActions from "./StatusRequestActions";

export const dynamic = "force-dynamic";

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="text-[13px] text-ink mt-0.5 whitespace-pre-line break-words">{children}</dd>
    </div>
  );
}

export default async function NrSynergyProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const { id } = await params;
  const supabase = await createClient();

  const backLink = (
    <Link href="/tools/nr-synergy/projects" className={`${linkClass} text-[12.5px] self-start`}>
      ← {s.back}
    </Link>
  );
  const notFound = (
    <div className="flex flex-col">
      {backLink}
      <NrsState icon="chart" title={s.notFound} />
    </div>
  );
  if (!isUuid(id)) return notFound;

  // RLS decides visibility: owner, starter, team members, their manager and HR.
  const { data: projData, error: projErr } = await supabase
    .from("nrs_projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (projErr) throw new Error(projErr.message);
  if (!projData) return notFound;
  const project = normaliseProject(projData as ProjectRow);

  const admin = createAdminClient();
  const [memberIds, histRes, viewerTz, canManage, last] = await Promise.all([
    projectMemberIds(admin, project),
    project.approval_status === "approved"
      ? admin.from("nrs_project_updates").select(UPDATE_COLUMNS).eq("project_id", project.id).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as ProjectUpdateRow[], error: null }),
    memberTimezone(supabase, member),
    canManageProject(admin, ctx, project),
    latestUpdates(admin, [project.id]),
  ]);
  if (histRes.error) throw new Error(histRes.error.message);
  const history = (histRes.data ?? []) as ProjectUpdateRow[];

  const people = await memberInfo(admin, member.org_id, [
    ...memberIds,
    project.created_by_member,
    project.status_requested_by,
    ...history.map((u) => u.member_id),
    ...history.map((u) => u.help_needed_member_id),
  ]);
  const name = (mid: string | null | undefined) => (mid ? people.get(mid)?.full_name ?? "—" : "—");
  const owner = people.get(project.owner_member_id);
  const overdue = isUpdateOverdue(project, last.get(project.id) ?? null, owner?.tz ?? "UTC");

  const isOwner = project.owner_member_id === member.id;
  const onProject = isOwner || memberIds.includes(member.id);
  const live = project.approval_status === "approved" && !project.archived_at;
  const isCreator = project.created_by_member === member.id;

  let returned: { comment: string | null; approverName: string | null } | null = null;
  if (project.approval_status !== "approved" && (isCreator || canManage)) {
    const subs = isCreator ? await loadMySubmissions(admin, member) : [];
    const mine = subs.find((x) => x.id === project.id);
    if (mine) returned = { comment: mine.comment, approverName: mine.approverName };
  }

  let countryName: string | null = null;
  if (project.country_code) {
    const { data: c } = await supabase
      .from("nrs_countries")
      .select("name")
      .eq("org_id", member.org_id)
      .eq("code", project.country_code)
      .maybeSingle();
    countryName = (c as { name: string } | null)?.name ?? project.country_code;
  }

  const value = formatValue(project.value_minor, project.value_currency);
  const pickable = onProject && live ? (await listOrgMembers(supabase, member.org_id)).filter((p) => p.id !== member.id) : [];

  return (
    <div className="flex flex-col gap-4">
      {backLink}

      {project.approval_status !== "approved" && (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-[13px] ${
            project.approval_status === "rejected" ? "border-critical/40 bg-critical-wash text-critical" : "border-warning bg-warning-wash text-ink"
          }`}
        >
          <p className="font-bold">{s.pendingBanner[project.approval_status]}</p>
          {returned?.comment && (
            <p className="mt-1 whitespace-pre-line break-words">
              {fill(s.submissions.approverSaid, { name: returned.approverName ?? "", comment: returned.comment })}
            </p>
          )}
          {isCreator && project.approval_status === "sent_back" && !project.archived_at && (
            <Link href={`/tools/nr-synergy/projects/${project.id}/edit`} className={`${linkClass} inline-block mt-2`}>
              {s.submissions.editResubmit} →
            </Link>
          )}
        </div>
      )}
      {project.status_requested && !project.archived_at && (canManage || onProject) && (
        <div role="status" className="rounded-md border border-warning bg-warning-wash px-4 py-3 text-[13px] text-ink">
          <p className="font-bold">{s.statusRequest.title}</p>
          <p className="mt-0.5">
            {canManage
              ? fill(s.statusRequest.body, {
                  name: name(project.status_requested_by),
                  from: s.status[project.status],
                  to: s.status[project.status_requested],
                })
              : fill(s.statusRequest.waiting, { to: s.status[project.status_requested] })}
          </p>
          {canManage && <StatusRequestActions projectId={project.id} from={project.status} />}
        </div>
      )}
      {project.archived_at && (
        <p role="status" className="rounded-md border border-border bg-page px-4 py-2.5 text-[13px] text-ink-2">
          {s.manage.archivedNotice}
        </p>
      )}

      <Card as="article" labelledBy="nrs-project-title" className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_TONE[project.status]}>{s.status[project.status]}</Pill>
            {project.approval_status !== "approved" && (
              <Pill tone={APPROVAL_TONE[project.approval_status]}>{s.approval[project.approval_status]}</Pill>
            )}
            {overdue && <Pill tone="critical">{s.overdue}</Pill>}
            {project.archived_at && <Pill>{s.archived}</Pill>}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 id="nrs-project-title" className="text-[20px] sm:text-[24px] font-bold text-ink tracking-tight break-words min-w-0">
              {project.name}
            </h1>
            {canManage && (
              <div className="flex flex-wrap items-start gap-2">
                <Link href={`/tools/nr-synergy/projects/${project.id}/edit`} className={secondaryButtonClass}>
                  {s.manage.edit}
                </Link>
                <ArchiveButton projectId={project.id} archived={!!project.archived_at} />
              </div>
            )}
          </div>
          {project.description && <p className="text-[13.5px] leading-relaxed text-ink-2 whitespace-pre-line break-words">{project.description}</p>}
        </header>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 rounded-sm bg-page px-4 py-3">
          <Field label={s.fields.owner}>{isOwner ? `${name(project.owner_member_id)} (${s.you})` : name(project.owner_member_id)}</Field>
          <Field label={s.fields.value}>{value ?? s.fields.none}</Field>
          <Field label={s.fields.nextSteps} wide>
            {project.next_steps || s.fields.none}
          </Field>
          <Field label={s.fields.division}>{project.division || s.fields.none}</Field>
          <Field label={s.fields.country}>{countryName || s.fields.none}</Field>
          <Field label={s.fields.tags} wide>
            {project.tags.length ? (
              <span className="flex flex-wrap gap-1.5">
                {project.tags.map((t) => (
                  <Pill key={t} tone="brand">
                    #{t}
                  </Pill>
                ))}
              </span>
            ) : (
              s.fields.none
            )}
          </Field>
          <Field label={s.fields.members} wide>
            {memberIds.map((m) => name(m)).join(", ")}
          </Field>
          <Field label={s.fields.createdBy}>
            {name(project.created_by_member)}
            {project.approved_at ? ` · ${fill(s.fields.approvedOn, { date: fmtDate(project.approved_at, viewerTz) })}` : ""}
          </Field>
        </dl>
      </Card>

      {project.approval_status === "approved" && (
        <div className={`grid gap-4 ${onProject && live ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : ""}`}>
          {onProject && live && (
            <Card labelledBy="nrs-update-title" className="self-start">
              <SectionTitle id="nrs-update-title">{s.update.title}</SectionTitle>
              <p className="text-[12px] text-ink-muted -mt-2 mb-3">{s.update.subtitle}</p>
              <ProjectUpdateForm
                projectId={project.id}
                people={pickable}
                initialStatus={project.status}
                canSetStatus={canManage}
                initialNextSteps={project.next_steps ?? ""}
              />
            </Card>
          )}

          <Card labelledBy="nrs-history-title">
            <SectionTitle
              id="nrs-history-title"
              aside={<span className="text-[11.5px] text-ink-muted">{fill(s.timeline.tzNote, { tz: viewerTz })}</span>}
            >
              {s.timeline.title}
            </SectionTitle>
            {history.length === 0 ? (
              <EmptyLine>{s.timeline.empty}</EmptyLine>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l-2 border-border ml-1.5 pl-4">
                {history.map((u) => (
                  <li key={u.id} className="relative flex flex-col gap-1.5">
                    <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-surface bg-brand" aria-hidden="true" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12.5px] text-ink min-w-0">
                        <span className="font-bold">{name(u.member_id)}</span>
                        <span className="text-ink-muted">
                          {" · "}
                          <time dateTime={u.created_at}>{fill(s.timeline.postedAt, { when: fmtDateTime(u.created_at, viewerTz) })}</time>
                        </span>
                      </p>
                      {u.status_proposed ? (
                        <Pill tone="warning">{fill(s.timeline.suggested, { status: s.status[u.status] ?? u.status })}</Pill>
                      ) : (
                        <Pill tone={STATUS_TONE[u.status] ?? "neutral"}>{s.status[u.status] ?? u.status}</Pill>
                      )}
                    </div>
                    <p className="text-[13px] text-ink-2 whitespace-pre-line break-words">{u.progress}</p>
                    {u.challenges && (
                      <p className="text-[12.5px] text-ink-2 whitespace-pre-line break-words">
                        <span className="font-bold">{s.timeline.challenges}: </span>
                        {u.challenges}
                      </p>
                    )}
                    {u.plan_of_action && (
                      <p className="text-[12.5px] text-ink-2 whitespace-pre-line break-words">
                        <span className="font-bold">{s.timeline.plan}: </span>
                        {u.plan_of_action}
                      </p>
                    )}
                    {u.next_steps && (
                      <p className="text-[12.5px] text-ink-2 whitespace-pre-line break-words">
                        <span className="font-bold">{s.timeline.nextSteps}: </span>
                        {u.next_steps}
                      </p>
                    )}
                    {u.help_needed_member_id && (
                      <span>
                        <Pill tone="warning">{fill(s.timeline.help, { name: name(u.help_needed_member_id) })}</Pill>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
