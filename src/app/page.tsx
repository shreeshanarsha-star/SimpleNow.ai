import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import GoldSearchGlyph from "@/components/GoldSearchGlyph";
import GlobalSearchBar from "@/components/GlobalSearchBar";
import Icon from "@/components/Icon";
import { DEPARTMENTS, PERSONAL_TOOLS, totalLiveTools, type Tool } from "@/lib/departments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A short, real, hand-picked set of live tools to spotlight on first
// arrival -- never the whole catalog (that's what Sidebar + search are
// for). Every href here is a genuine route from departments.ts, nothing
// fabricated. Order is deliberate: the two heaviest-used HR tools, then
// one from elsewhere in Talent Acquisition, then Personal Tools last
// since it's available regardless of org/license.
const SPOTLIGHT_KEYS = ["Talent.ai", "Job Postings.ai", "Offer.ai"];

function findSpotlightTools(): (Tool & { deptIcon: string })[] {
  const found: (Tool & { deptIcon: string })[] = [];
  for (const key of SPOTLIGHT_KEYS) {
    for (const dept of DEPARTMENTS) {
      const t = dept.tools.find((tool) => tool.n === key && tool.s === "live" && tool.href);
      if (t) {
        found.push({ ...t, deptIcon: dept.icon });
        break;
      }
    }
  }
  return found;
}

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let firstName: string | null = null;
  let avatarUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    const label = profile?.full_name || user.email?.split("@")[0] || null;
    firstName = label ? label.split(" ")[0] : null;
    avatarUrl = profile?.avatar_url ?? null;
  }

  const spotlight = findSpotlightTools();
  const deptCount = DEPARTMENTS.length;

  return (
    <AppShell title="Overview" sidebarMode="home">
      <div
        className="flex-1 flex flex-col min-h-0 relative -mx-[26px] -mb-[26px] overflow-hidden"
        id="overviewView"
      >
        {/* Decorative wave art -- purely atmospheric, sits behind the
            content and search bar. Both fills resolve through the active
            theme's --wave-1/--wave-2 custom properties (already encoded
            as rgba with the intended opacity), so the panel re-tints with
            the rest of the chrome when the theme switches. */}
        <svg
          className="absolute inset-x-0 bottom-0 w-full h-[52%] pointer-events-none"
          viewBox="0 0 1000 320"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,160 C220,90 420,210 1000,110 L1000,320 L0,320 Z"
            style={{ fill: "var(--wave-1)" }}
          />
          <path
            d="M0,210 C260,150 560,270 1000,180 L1000,320 L0,320 Z"
            style={{ fill: "var(--wave-2)" }}
          />
        </svg>

        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 px-[26px] relative z-10 py-8">
          {user ? (
            <div className="flex items-center gap-2.5 text-[13px] font-medium text-ink-2">
              <Avatar name={firstName} email={user.email} avatarUrl={avatarUrl} size={26} className="shadow-emblem" />
              <span>
                {greetingWord()}
                {firstName ? `, ${firstName}` : ""}
              </span>
            </div>
          ) : (
            <div className="text-[13px] font-medium text-ink-2 tracking-wide uppercase">
              Askshree AI Console
            </div>
          )}

          <div className="w-[68px] h-[68px] rounded-full bg-[var(--badge-bg)] shadow-soft-sm flex items-center justify-center">
            <GoldSearchGlyph size={30} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[30px] sm:text-[34px] font-semibold text-ink tracking-tight leading-tight">
              What do you need?
            </div>
            <div className="text-[14.5px] text-ink-muted max-w-[440px] mx-auto">
              One place to search, ask, and work across every AI system your
              organization has licensed.
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5 bg-brand-wash text-brand-dark rounded-full px-3 py-1 font-medium">
              <span className="w-[6px] h-[6px] rounded-full bg-good" />
              {totalLiveTools} live AI systems
            </span>
            <span className="inline-flex items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1 font-medium shadow-soft-sm">
              {deptCount} departments mapped
            </span>
          </div>
        </div>

        <div className="relative z-10">
          <GlobalSearchBar />
        </div>

        {spotlight.length > 0 && (
          <div className="relative z-10 px-[26px] pb-6 -mt-2">
            <div className="max-w-[640px] mx-auto flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11.5px] text-ink-muted font-medium mr-1">
                Quick start:
              </span>
              {spotlight.map((tool) => (
                <Link
                  key={tool.n}
                  href={tool.href!}
                  className="inline-flex items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-soft-sm hover:border-brand hover:text-brand-dark transition-colors"
                >
                  <Icon name={tool.deptIcon} className="w-3.5 h-3.5" />
                  {tool.n}
                </Link>
              ))}
              <Link
                href={`/departments/${PERSONAL_TOOLS.id}`}
                className="inline-flex items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-soft-sm hover:border-brand hover:text-brand-dark transition-colors"
              >
                <Icon name={PERSONAL_TOOLS.icon} className="w-3.5 h-3.5" />
                Personal Tools
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
