import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import GoldSearchGlyph from "@/components/GoldSearchGlyph";
import GlobalSearchBar from "@/components/GlobalSearchBar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
          </div>
        </div>

        <div className="relative z-10">
          <GlobalSearchBar />
        </div>

      </div>
    </AppShell>
  );
}
