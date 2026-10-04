import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { gatePage } from "../_home/gate";
import { memberTimezone } from "../_home/server";
import { PageHeader, primaryButtonClass, secondaryButtonClass } from "../_home/ui";
import ProjectsTable from "./_components/ProjectsTable";
import { loadProjectTable, type ProjectScope } from "./_table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

// Projects: one table, three views.
//   My projects  — everyone: submit the weekly update / challenges / plan per project.
//   My team      — managers: approve new projects and each weekly update inline.
//   All projects — admins: every project, Excel download of all reports.
export default async function NrSynergyProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const sp = await searchParams;
  const raw = Array.isArray(sp.view) ? sp.view[0] : sp.view;

  const scopes: ProjectScope[] = ["mine", ...(ctx.isManager ? (["team"] as const) : []), ...(ctx.isHr ? (["all"] as const) : [])];
  const scope: ProjectScope = scopes.includes(raw as ProjectScope) ? (raw as ProjectScope) : "mine";

  const supabase = await createClient();
  const admin = createAdminClient();
  const [rows, tz] = await Promise.all([loadProjectTable(supabase, admin, ctx, member, scope), memberTimezone(supabase, member)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={s.title}
        subtitle={s.table.subtitles[scope]}
        aside={
          <div className="flex flex-wrap gap-2">
            {ctx.isHr && (
              <a href="/api/nr-synergy/projects/export" download className={secondaryButtonClass}>
                {s.export.button}
              </a>
            )}
            <Link href="/tools/nr-synergy/projects/new" className={primaryButtonClass}>
              + {s.newProject}
            </Link>
          </div>
        }
      />

      {scopes.length > 1 && (
        <nav aria-label={s.title} className="flex gap-1 rounded-full bg-page p-1 self-start">
          {scopes.map((sc) => (
            <Link
              key={sc}
              href={sc === "mine" ? "/tools/nr-synergy/projects" : `/tools/nr-synergy/projects?view=${sc}`}
              aria-current={sc === scope ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors ${
                sc === scope ? "bg-surface text-ink shadow-soft-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {s.table.tabs[sc]}
            </Link>
          ))}
        </nav>
      )}

      <ProjectsTable rows={rows} scope={scope} tz={tz} />
    </div>
  );
}
