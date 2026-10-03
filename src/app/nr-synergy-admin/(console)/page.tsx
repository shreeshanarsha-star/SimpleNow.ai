import Link from "next/link";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { getNrsContext } from "@/lib/nrs/member";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { ADMIN_SECTIONS, type AdminSectionKey } from "@/lib/nrs/adminConsole";

export const dynamic = "force-dynamic";

type Count = number | null;

// Overview: headline counts for the caller's org, read on the caller's own
// (RLS) client. A query that fails or is not visible shows "Unavailable"
// instead of breaking the page. The console layout has already checked HR.
async function loadCounts(orgId: string): Promise<{ members: Count; countries: Count; pending: Count; demo: boolean | null }> {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [members, countries, pending, demo] = await Promise.allSettled([
    supabase.from("nrs_members").select("id", head).eq("org_id", orgId).eq("status", "active").is("deleted_at", null),
    supabase.from("nrs_countries").select("code", head).eq("org_id", orgId),
    supabase.from("nrs_requests").select("id", head).eq("org_id", orgId).eq("status", "pending"),
    supabase.from("nrs_members").select("id", head).eq("org_id", orgId).eq("is_demo", true),
  ]);
  const count = (r: PromiseSettledResult<{ count: number | null; error: unknown }>): Count =>
    r.status === "fulfilled" && !r.value.error ? (r.value.count ?? 0) : null;
  const demoCount = count(demo);
  return {
    members: count(members),
    countries: count(countries),
    pending: count(pending),
    demo: demoCount === null ? null : demoCount > 0,
  };
}

function hrefOf(key: AdminSectionKey): string {
  return ADMIN_SECTIONS.find((x) => x.key === key)?.href ?? "#";
}

function StatCard({
  label,
  value,
  icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: string;
  href: string;
  tone?: "default" | "muted";
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</span>
        <span className="w-8 h-8 rounded-md bg-brand-wash text-brand flex items-center justify-center">
          <Icon name={icon} className="w-4 h-4" />
        </span>
      </div>
      <span className={`text-[26px] leading-none font-bold tabular-nums ${tone === "muted" ? "text-ink-muted text-[15px]" : "text-ink"}`}>
        {value}
      </span>
      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-dark">
        {s.console.overview.manage}
        <Icon name="chevronRight" className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const ctx = await getNrsContext();
  const o = s.console.overview;
  const counts = ctx?.orgId ? await loadCounts(ctx.orgId) : { members: null, countries: null, pending: null, demo: null };
  const num = (n: Count) => (n === null ? o.unavailable : n.toLocaleString("en"));

  const sections = ADMIN_SECTIONS.filter((x) => x.key !== "overview");

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <header>
        <h1 className="text-[20px] font-bold text-ink">{o.title}</h1>
        <p className="text-[12.5px] text-ink-muted mt-0.5">{o.subtitle}</p>
      </header>

      <section aria-label={o.title} className="grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={o.members}
          value={num(counts.members)}
          icon="users"
          href={hrefOf("users")}
          tone={counts.members === null ? "muted" : "default"}
        />
        <StatCard
          label={o.countries}
          value={num(counts.countries)}
          icon="globe"
          href={hrefOf("countries")}
          tone={counts.countries === null ? "muted" : "default"}
        />
        <StatCard
          label={o.pending}
          value={num(counts.pending)}
          icon="check"
          href={hrefOf("approvals")}
          tone={counts.pending === null ? "muted" : "default"}
        />
        <StatCard
          label={o.demo}
          value={counts.demo === null ? o.unavailable : counts.demo ? o.demoOn : o.demoOff}
          icon="database"
          href={hrefOf("demo")}
          tone={counts.demo === null ? "muted" : "default"}
        />
      </section>

      <section aria-labelledby="nrs-admin-jump" className="flex flex-col gap-3">
        <h2 id="nrs-admin-jump" className="text-[14px] font-bold text-ink">
          {o.quickLinks}
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sections.map((sec) => (
            <li key={sec.key}>
              <Link
                href={sec.href}
                className="group flex h-full items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-brand-wash/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="w-9 h-9 shrink-0 rounded-md bg-page text-brand-dark flex items-center justify-center group-hover:bg-surface">
                  <Icon name={sec.icon} className="w-[18px] h-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-ink">{s.console.nav[sec.key]}</span>
                  <span className="block text-[12px] text-ink-muted leading-snug mt-0.5">
                    {o.sectionHint[sec.key as Exclude<AdminSectionKey, "overview">]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
