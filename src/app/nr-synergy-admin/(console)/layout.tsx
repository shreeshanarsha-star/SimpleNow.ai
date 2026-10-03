import Link from "next/link";
import { redirect } from "next/navigation";
import Icon from "@/components/Icon";
import { getNrsContext, nrsLicenceError } from "@/lib/nrs/member";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { fillSearch } from "@/lib/nrs/i18n/en/search";
import { ADMIN_LOGIN_PATH } from "@/lib/nrs/adminConsole";
import { NRS_ADMIN_BASE, NRS_BASE } from "@/lib/nrs/tabs";
import ConsoleMark from "../_components/ConsoleMark";
import ConsoleNav from "../_components/ConsoleNav";
import ConsoleSignOut from "../_components/ConsoleSignOut";
import ConsoleState from "../_components/ConsoleState";

export const dynamic = "force-dynamic";

const linkBtn =
  "inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-bold text-ink-2 transition-colors hover:bg-page hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

// Server-side guard + shell for every Admin Console page. Middleware already
// bounces signed-out visitors to the console sign-in; this re-checks on the
// server (session, HR / super admin / platform admin, org licence).
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getNrsContext();
  if (!ctx || ctx.user.is_anonymous || !ctx.user.email) redirect(ADMIN_LOGIN_PATH);

  if (!ctx.isHr) {
    return (
      <ConsoleState
        icon="x"
        title={s.console.noAccessTitle}
        body={fillSearch(s.console.noAccessBody, { email: ctx.user.email ?? "" })}
      >
        <Link href={NRS_BASE} className={`${linkBtn} !bg-brand !text-white !border-brand`}>
          {s.console.openEmployeeApp}
        </Link>
        <ConsoleSignOut label={s.console.signInAsSomeoneElse} />
      </ConsoleState>
    );
  }

  const licence = await nrsLicenceError(s.common.error);
  if (licence) {
    return (
      <ConsoleState icon="x" title={s.console.licenceTitle} body={licence}>
        <ConsoleSignOut />
      </ConsoleState>
    );
  }

  if (!ctx.orgId) {
    return (
      <ConsoleState icon="x" title={s.console.noAccessTitle} body={s.console.noOrgBody}>
        <ConsoleSignOut />
      </ConsoleState>
    );
  }

  const displayName = ctx.member?.full_name || ctx.firstName || ctx.user.email || "";

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <a
        href="#nrs-admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:text-[12.5px] focus:font-bold focus:shadow-soft"
      >
        {s.console.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 h-14">
          <Link
            href={NRS_ADMIN_BASE}
            className="min-w-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`${s.console.product} · ${s.console.name}`}
          >
            <ConsoleMark />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden lg:block max-w-[220px] truncate text-[12px] text-ink-muted" title={ctx.user.email ?? undefined}>
              {fillSearch(s.console.signedInAs, { name: displayName })}
            </span>
            <span
              aria-hidden="true"
              className="hidden sm:flex lg:hidden w-8 h-8 shrink-0 rounded-full bg-brand-wash text-brand-dark text-[12px] font-bold items-center justify-center"
              title={displayName}
            >
              {displayName.charAt(0).toUpperCase()}
            </span>
            <Link href={NRS_BASE} className={linkBtn}>
              <Icon name="externalLink" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{s.console.openEmployeeApp}</span>
              <span className="sr-only sm:hidden">{s.console.openEmployeeApp}</span>
            </Link>
            <ConsoleSignOut />
          </div>
        </div>
        {/* Below md the sidebar collapses into this bar. */}
        <div className="md:hidden border-t border-border px-3 py-2">
          <ConsoleNav />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
          <div className="sticky top-14 flex flex-col gap-4 p-4">
            <ConsoleNav />
            <div className="mt-2 rounded-md border border-border bg-page px-3 py-2.5">
              <p className="text-[11px] font-semibold text-ink-muted">{fillSearch(s.console.signedInAs, { name: "" }).trim()}</p>
              <p className="text-[12.5px] font-bold text-ink truncate" title={ctx.user.email ?? undefined}>
                {displayName}
              </p>
            </div>
          </div>
        </aside>
        <main id="nrs-admin-main" tabIndex={-1} className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7 focus:outline-none">
          <div className="mx-auto w-full max-w-6xl min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
