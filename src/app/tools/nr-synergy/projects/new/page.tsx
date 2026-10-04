import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { gatePage } from "../../_home/gate";
import { Card, PageHeader, linkClass } from "../../_home/ui";
import ProjectForm from "../_components/ProjectForm";
import { loadFormOptions } from "../_server";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const gate = await gatePage("projects");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const supabase = await createClient();
  const opts = await loadFormOptions(supabase, member.org_id);
  const homeCurrency = opts.countries.find((c) => c.code === member.home_country)?.currency?.toUpperCase();

  return (
    <div className="flex flex-col gap-3 max-w-[760px]">
      <Link href="/tools/nr-synergy/projects" className={`${linkClass} text-[12.5px] self-start`}>
        ← {s.back}
      </Link>
      <PageHeader title={s.form.createTitle} subtitle={s.form.createSubtitle} />
      <Card>
        <ProjectForm
          mode="create"
          meId={member.id}
          people={opts.people}
          countries={opts.countries}
          currencies={opts.currencies}
          divisions={opts.divisions}
          cancelHref="/tools/nr-synergy/projects"
          canAssignOwner={ctx.isHr}
          canSetStatus={ctx.isHr}
          initial={{
            name: "",
            description: "",
            owner_member_id: member.id,
            status: "pending",
            value_amount: "",
            value_currency: homeCurrency && opts.currencies.includes(homeCurrency) ? homeCurrency : opts.currencies[0] ?? "USD",
            next_steps: "",
            tags: "",
            division: member.division ?? "",
            country_code: opts.countries.some((c) => c.code === member.home_country) ? member.home_country : "",
            member_ids: [],
          }}
        />
      </Card>
    </div>
  );
}
