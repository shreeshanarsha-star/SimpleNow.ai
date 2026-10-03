import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sumMinor } from "@/lib/nrs/money";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import NrsState from "../_components/NrsState";
import { gatePage } from "../_home/gate";
import { memberTimezone } from "../_home/server";
import { Card, PageHeader, Pill, SectionTitle, fill, fmtDate, inputClass, labelClass, linkClass, primaryButtonClass, secondaryButtonClass } from "../_home/ui";
import { APPROVAL_TONE, PROJECT_STATUSES, STATUS_TONE, formatValue, isProjectStatus } from "./_lib";
import { loadApprovedProjects, loadMySubmissions, withMeta, type ProjectWithMeta, type Submission } from "./_server";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function one(sp: SP, key: string, max = 120): string {
  const v = sp[key];
  const s1 = Array.isArray(v) ? v[0] : v;
  return typeof s1 === "string" ? s1.trim().slice(0, max) : "";
}

function uniqSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && !!v.trim()))).sort((a, b) => a.localeCompare(b));
}

function SubmissionRow({ p, tz }: { p: Submission; tz: string }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={APPROVAL_TONE[p.approval_status]}>{s.approval[p.approval_status]}</Pill>
          <span className="text-[11.5px] text-ink-muted">{fill(s.submissions.submitted, { date: fmtDate(p.submittedAt, tz) })}</span>
        </div>
        <p className="text-[14px] font-bold text-ink break-words">{p.name}</p>
        {p.approval_status === "pending" && p.waitingOn && (
          <p className="text-[12px] text-ink-muted">{fill(s.submissions.waitingOn, { name: p.waitingOn })}</p>
        )}
        {p.comment && (
          <p className="text-[12.5px] text-ink-2 whitespace-pre-line break-words border-l-2 border-warning pl-2">
            {fill(s.submissions.approverSaid, { name: p.approverName ?? "", comment: p.comment })}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {p.approval_status === "sent_back" && (
          <Link href={`/tools/nr-synergy/projects/${p.id}/edit`} className={primaryButtonClass}>
            {s.submissions.editResubmit}
          </Link>
        )}
        <Link href={`/tools/nr-synergy/projects/${p.id}`} className={secondaryButtonClass} aria-label={`${s.submissions.view}: ${p.name}`}>
          {s.submissions.view}
        </Link>
      </div>
    </li>
  );
}

function ProjectCard({ p, meId, tz }: { p: ProjectWithMeta; meId: string; tz: string }) {
  const value = formatValue(p.value_minor, p.value_currency);
  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-ink break-words">
            <Link href={`/tools/nr-synergy/projects/${p.id}`} className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm">
              {p.name}
            </Link>
          </h3>
          <p className="text-[12px] text-ink-muted truncate">
            {p.owner_member_id === meId ? `${s.owner}: ${s.you}` : fill(s.ownerLabel, { name: p.ownerName })}
            {p.division ? ` · ${p.division}` : ""}
            {p.country_code ? ` · ${p.country_code}` : ""}
          </p>
        </div>
        <Pill tone={STATUS_TONE[p.status]}>{s.status[p.status]}</Pill>
      </div>
      {p.description && <p className="text-[12.5px] text-ink-2 line-clamp-2 break-words">{p.description}</p>}
      {p.next_steps && (
        <p className="text-[12.5px] text-ink-2 line-clamp-2 break-words">
          <span className="font-bold">{s.fields.nextSteps}: </span>
          {p.next_steps}
        </p>
      )}
      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.tags.slice(0, 5).map((t) => (
            <Link
              key={t}
              href={`/tools/nr-synergy/projects?tag=${encodeURIComponent(t)}`}
              className="rounded-full bg-brand-wash text-brand-dark px-2 py-0.5 text-[11px] font-bold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="text-[13px] font-bold text-ink tabular-nums">{value ?? <span className="font-normal text-ink-muted">{s.fields.none}</span>}</span>
        <span className="flex items-center gap-1.5">
          {p.overdue ? (
            <Pill tone="critical">{s.overdue}</Pill>
          ) : (
            <span className="text-[11.5px] text-ink-muted">
              {p.lastUpdateAt ? fill(s.lastUpdate, { date: fmtDate(p.lastUpdateAt, tz) }) : s.noUpdatesYet}
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}

export default async function NrSynergyProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const sp = await searchParams;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [approved, submissions, tz] = await Promise.all([
    loadApprovedProjects(supabase, member.org_id),
    loadMySubmissions(admin, member),
    memberTimezone(supabase, member),
  ]);
  const all = await withMeta(admin, member.org_id, approved);

  const q = one(sp, "q", 100).toLowerCase();
  const statusF = one(sp, "status");
  const tagF = one(sp, "tag").toLowerCase();
  const divisionF = one(sp, "division");
  const countryF = one(sp, "country");
  const ownerF = one(sp, "owner");
  const overdueOnly = one(sp, "overdue") === "1";
  const filtering = !!(q || statusF || tagF || divisionF || countryF || ownerF || overdueOnly);

  const list = all.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)) &&
      (!isProjectStatus(statusF) || p.status === statusF) &&
      (!tagF || p.tags.includes(tagF)) &&
      (!divisionF || p.division === divisionF) &&
      (!countryF || p.country_code === countryF) &&
      (!ownerF || p.owner_member_id === ownerF) &&
      (!overdueOnly || p.overdue)
  );

  const tags = uniqSorted(all.flatMap((p) => p.tags));
  const divisions = uniqSorted(all.map((p) => p.division));
  const countries = uniqSorted(all.map((p) => p.country_code));
  const owners = Array.from(new Map(all.map((p) => [p.owner_member_id, p.ownerName])).entries()).sort((a, b) => a[1].localeCompare(b[1]));

  const showTotals = ctx.isManager || ctx.isHr;
  const totals = new Map<string, number[]>();
  for (const p of list) {
    if (p.value_minor == null || !p.value_currency) continue;
    totals.set(p.value_currency, [...(totals.get(p.value_currency) ?? []), p.value_minor]);
  }
  const totalLines = Array.from(totals.entries())
    .map(([cur, vals]) => formatValue(sumMinor(vals), cur))
    .filter((v): v is string => !!v);
  const overdueCount = all.filter((p) => p.overdue).length;

  const justSubmitted = one(sp, "submitted", 64);
  const select = (name: string, label: string, value: string, options: [string, string][]) => (
    <div className="min-w-0">
      <label htmlFor={`pf-${name}`} className={labelClass}>
        {label}
      </label>
      <select id={`pf-${name}`} name={name} defaultValue={value} className={inputClass}>
        <option value="">{s.filters.any}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        aside={
          <Link href="/tools/nr-synergy/projects/new" className={primaryButtonClass}>
            + {s.newProject}
          </Link>
        }
      />

      {justSubmitted && submissions.some((p) => p.id === justSubmitted) && (
        <p role="status" className="rounded-md bg-good-wash text-good-text px-4 py-2.5 text-[13px] font-bold">
          {s.form.submitted}
        </p>
      )}

      {submissions.length > 0 && (
        <Card labelledBy="nrs-my-submissions">
          <SectionTitle id="nrs-my-submissions" aside={<span className="text-[11.5px] text-ink-muted">{s.submissions.subtitle}</span>}>
            {s.submissions.title}
          </SectionTitle>
          <ul className="flex flex-col divide-y divide-border">
            {submissions.map((p) => (
              <SubmissionRow key={p.id} p={p} tz={tz} />
            ))}
          </ul>
        </Card>
      )}

      {all.length === 0 ? (
        <NrsState icon="chart" title={s.empty} body={s.emptyBody} action={{ href: "/tools/nr-synergy/projects/new", label: s.newProject }} />
      ) : (
        <>
          <Card as="section" labelledBy="nrs-proj-filters" className="!p-3 sm:!p-4">
            <h2 id="nrs-proj-filters" className="sr-only">
              {s.filters.label}
            </h2>
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))_auto] lg:items-end">
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <label htmlFor="pf-q" className={labelClass}>
                  {s.filters.search}
                </label>
                <input id="pf-q" type="search" name="q" defaultValue={one(sp, "q", 100)} placeholder={s.filters.searchPlaceholder} className={inputClass} />
              </div>
              {select(
                "status",
                s.filters.status,
                statusF,
                PROJECT_STATUSES.map((st) => [st, s.status[st]])
              )}
              {select(
                "tag",
                s.filters.tag,
                tagF,
                tags.map((t) => [t, `#${t}`])
              )}
              {select(
                "division",
                s.filters.division,
                divisionF,
                divisions.map((d) => [d, d])
              )}
              {select(
                "country",
                s.filters.country,
                countryF,
                countries.map((c) => [c, c])
              )}
              {select("owner", s.filters.owner, ownerF, owners)}
              <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                <button type="submit" className={primaryButtonClass}>
                  {s.filters.apply}
                </button>
                {filtering && (
                  <Link href="/tools/nr-synergy/projects" className={secondaryButtonClass}>
                    {s.clearFilters}
                  </Link>
                )}
              </div>
            </form>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-live="polite">
            <p className="text-[12.5px] text-ink-muted">
              {fill(s.filters.showing, { count: list.length, total: all.length })}
              {overdueCount > 0 && !overdueOnly && (
                <>
                  {" · "}
                  <Link href="/tools/nr-synergy/projects?overdue=1" className={linkClass}>
                    {overdueCount} {s.overdue.toLowerCase()}
                  </Link>
                </>
              )}
            </p>
            {showTotals && (
              <p className="text-[12.5px] text-ink-2" title={s.filters.totalValueHint}>
                <span className="font-bold">{s.filters.totalValue}: </span>
                <span className="tabular-nums">{totalLines.length ? totalLines.join(" + ") : s.filters.noValue}</span>
              </p>
            )}
          </div>

          {list.length === 0 ? (
            <NrsState icon="filter" title={s.noMatches} action={{ href: "/tools/nr-synergy/projects", label: s.clearFilters }} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <ProjectCard key={p.id} p={p} meId={member.id} tz={tz} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
