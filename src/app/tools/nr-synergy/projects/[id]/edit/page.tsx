import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromMinor } from "@/lib/nrs/money";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import NrsState from "../../../_components/NrsState";
import { gatePage } from "../../../_home/gate";
import { isUuid } from "../../../_home/server";
import { Card, PageHeader, fill, linkClass } from "../../../_home/ui";
import ProjectForm, { type ProjectFormMode } from "../../_components/ProjectForm";
import { PROJECT_COLUMNS, normaliseProject, type ProjectRow } from "../../_lib";
import { canManageProject, loadFormOptions, loadMySubmissions, projectMemberIds } from "../../_server";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const { id } = await params;
  const back = (
    <Link href={isUuid(id) ? `/tools/nr-synergy/projects/${id}` : "/tools/nr-synergy/projects"} className={`${linkClass} text-[12.5px] self-start`}>
      ← {s.back}
    </Link>
  );
  const notFound = (
    <div className="flex flex-col">
      {back}
      <NrsState icon="chart" title={s.notFound} />
    </div>
  );
  if (!isUuid(id)) return notFound;

  const supabase = await createClient();
  const { data, error } = await supabase.from("nrs_projects").select(PROJECT_COLUMNS).eq("id", id).eq("org_id", member.org_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return notFound;
  const project = normaliseProject(data as ProjectRow);

  const admin = createAdminClient();
  let mode: ProjectFormMode | null = null;
  if (project.created_by_member === member.id && project.approval_status === "sent_back" && !project.archived_at) mode = "resubmit";
  else if (await canManageProject(admin, ctx, project)) mode = "update";
  if (!mode) return notFound;

  const [opts, memberIds, submissions] = await Promise.all([
    loadFormOptions(supabase, member.org_id),
    projectMemberIds(admin, project),
    mode === "resubmit" ? loadMySubmissions(admin, member) : Promise.resolve([]),
  ]);
  const returned = submissions.find((sub) => sub.id === project.id);
  const currency = project.value_currency ?? opts.currencies[0] ?? "USD";

  return (
    <div className="flex flex-col gap-3 max-w-[760px]">
      {back}
      <PageHeader
        title={mode === "resubmit" ? s.form.resubmitTitle : s.form.manageTitle}
        subtitle={mode === "resubmit" ? s.form.resubmitSubtitle : s.form.manageSubtitle}
      />
      {returned?.comment && (
        <aside className="rounded-md border border-warning bg-warning-wash px-4 py-3 text-[13px] text-ink" aria-label={s.approval.sent_back}>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-2">
            {fill(s.form.returnedComment, { name: returned.approverName ?? s.approval.sent_back })}
          </p>
          <p className="mt-1 whitespace-pre-line break-words">{returned.comment}</p>
        </aside>
      )}
      <Card>
        <ProjectForm
          mode={mode}
          projectId={project.id}
          meId={member.id}
          people={opts.people}
          countries={opts.countries}
          currencies={opts.currencies.includes(currency) ? opts.currencies : [...opts.currencies, currency]}
          divisions={opts.divisions}
          cancelHref={`/tools/nr-synergy/projects/${project.id}`}
          initial={{
            name: project.name,
            description: project.description ?? "",
            owner_member_id: project.owner_member_id,
            status: project.status,
            value_amount: project.value_minor != null && project.value_currency ? fromMinor(project.value_minor, project.value_currency) : "",
            value_currency: currency,
            next_steps: project.next_steps ?? "",
            tags: project.tags.join(", "),
            division: project.division ?? "",
            country_code: project.country_code ?? "",
            member_ids: memberIds.filter((m) => m !== project.owner_member_id),
          }}
        />
      </Card>
    </div>
  );
}
