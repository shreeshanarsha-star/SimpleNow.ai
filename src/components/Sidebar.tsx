"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DEPARTMENTS, PERSONAL_TOOLS } from "@/lib/departments";
import { createClient } from "@/lib/supabase/client";
import Icon from "./Icon";
import LogoMark from "./LogoMark";

export default function Sidebar({
  open = false,
  onClose,
  alwaysDrawer = false,
}: {
  /** Whether the off-canvas drawer is currently showing. */
  open?: boolean;
  onClose?: () => void;
  /**
   * true  -> drawer-only at every breakpoint (used on tool/feature pages,
   *          which default to a collapsed sidebar so the tool gets full
   *          width -- reopened via Topbar's hamburger, desktop included).
   * false -> classic responsive behavior: a normal in-flow, always-visible
   *          panel on desktop (lg+), off-canvas drawer only below that
   *          (used on the Home/Overview page).
   */
  alwaysDrawer?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Real signed-in identity -- previously this row was hardcoded to
  // "Shree / Owner" regardless of who was actually logged in, which is
  // both wrong and left non-owner users with no way to tell they were
  // signed in as themselves.
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [settingsHref, setSettingsHref] = useState<string | null>(null);
  // Team Chat is org-scoped (RLS-enforced, one chat per org) -- it has no
  // meaning for a signed-out visitor or a signed-in user who isn't part of
  // an org yet, so the nav item itself should mirror that instead of
  // showing to everyone and letting /chat's middleware redirect sort it out.
  const [hasOrg, setHasOrg] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setEmail(user?.email ?? null);
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, org_role, org_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.is_admin) setSettingsHref("/admin");
      else if (profile?.org_role === "org_admin") setSettingsHref("/org/settings");
      setHasOrg(!!profile?.org_id);
    });
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Not fatal -- the local session should still be cleared client-side
        // even if the server-side call failed (expired session, network
        // blip, etc). Log it so it's not silently invisible, but proceed
        // to redirect regardless: staying signed-in-looking is worse than
        // a redirect that fails to also revoke server-side.
        console.error("Sign out error:", error.message);
      }
    } catch (err) {
      console.error("Sign out threw:", err);
    } finally {
      // Hard navigation, not router.push/refresh -- this guarantees every
      // server component and any in-memory client state re-reads auth from
      // scratch, instead of relying on the Next.js router cache to notice
      // the session changed. Previously a thrown/rejected signOut() call
      // left the button disabled forever with no visible feedback and no
      // navigation, because there was no try/catch and the redirect lines
      // never ran.
      window.location.href = "/login";
    }
  }

  const initials = email ? email.slice(0, 2).toUpperCase() : "?";
  const displayName = email ?? "Not signed in";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const backdropBreakpoint = alwaysDrawer ? "" : "lg:hidden";
  const staticBreakpoint = alwaysDrawer
    ? ""
    : "lg:static lg:inset-auto lg:translate-x-0 lg:z-auto";

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className={`${backdropBreakpoint} fixed inset-0 z-40 bg-black/40`}
        />
      )}
      <aside
        className={`w-[256px] flex-shrink-0 bg-gradient-to-b from-surface to-brand-wash flex flex-col h-full rounded-[28px] shadow-soft overflow-hidden
          fixed inset-y-4 left-4 z-50 transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-[calc(100%+16px)]"}
          ${staticBreakpoint}`}
      >
      {/* Same vertical padding (py-3) as Topbar's px-[26px] py-3, so the
          brand block and the "Overview" title land on one continuous
          horizontal line across the sidebar/main-column seam. */}
      <div className="flex items-center gap-3 px-5 py-3">
        <LogoMark size={32} className="shadow-emblem" />
        <div>
          <div className="font-semibold text-[16px] leading-tight text-ink">Askshree</div>
          <small className="block font-semibold text-[10px] text-brand tracking-[0.08em] mt-0.5">
            AI SYSTEMS
          </small>
        </div>
      </div>

      <nav className="flex-1 overflow-hidden px-3 pt-1 pb-2">
        <SbLink href="/" icon="grid" name="Overview" active={pathname === "/"} onNavigate={onClose} />
        <SbLink
          href={`/departments/${PERSONAL_TOOLS.id}`}
          icon={PERSONAL_TOOLS.icon}
          name={PERSONAL_TOOLS.name}
          active={isActive(`/departments/${PERSONAL_TOOLS.id}`)}
          onNavigate={onClose}
        />
        {hasOrg && (
          <SbLink
            href="/chat"
            icon="chat"
            name="Team Chat"
            active={isActive("/chat")}
            dotStatus="live"
            onNavigate={onClose}
          />
        )}

        <div className="text-[10px] font-semibold tracking-wider uppercase text-ink-muted px-2.5 pt-3 pb-1.5">
          AI Systems — by department
        </div>
        {DEPARTMENTS.map((d) => (
          <SbLink
            key={d.id}
            href={`/departments/${d.id}`}
            icon={d.icon}
            name={d.name}
            active={isActive(`/departments/${d.id}`)}
            dotStatus={d.status}
            onNavigate={onClose}
          />
        ))}
      </nav>

      {/* Bottom row -- deliberately left un-sticky/in-flow: nav above no
          longer scrolls (every item fits, no scrollbar), so this row
          naturally sits flush with the viewport bottom via the aside's
          own flex-col + h-screen, on the same line as GlobalSearchBar's
          sticky-bottom row in the main column. */}
      <div className="border-t border-border/70 px-4 py-3.5 flex items-center gap-2.5">
        {!email ? (
          <Link
            href="/login"
            onClick={onClose}
            className="flex items-center gap-2.5 flex-1 min-w-0 group"
          >
            <div className="w-[30px] h-[30px] rounded-full bg-surface border border-border text-ink-muted text-[11.5px] font-semibold flex items-center justify-center flex-shrink-0">
              ?
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-brand group-hover:underline">
                Sign in
              </div>
              <div className="text-[11px] text-ink-muted">Not signed in</div>
            </div>
          </Link>
        ) : (
          <>
        <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-brand to-brand-dark text-white text-[11.5px] font-semibold flex items-center justify-center flex-shrink-0 shadow-emblem">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold truncate text-ink" title={displayName}>
            {displayName}
          </div>
          <div className="text-[11px] text-ink-muted">Signed in</div>
        </div>
        {settingsHref && (
          <Link
            href={settingsHref}
            className="text-ink-muted hover:text-ink p-1"
            aria-label="Settings"
            title={settingsHref === "/admin" ? "Admin" : "Organization Settings"}
          >
            <Icon name="gear" className="w-[15px] h-[15px]" />
          </Link>
        )}
        {email && (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-ink-muted hover:text-ink p-1 disabled:opacity-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" className="w-[15px] h-[15px]" />
          </button>
        )}
          </>
        )}
      </div>
      </aside>
    </>
  );
}

function SbLink({
  href,
  icon,
  name,
  active,
  dotStatus,
  onNavigate,
}: {
  href: string;
  icon: string;
  name: string;
  active: boolean;
  dotStatus?: "live" | "soon";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2 px-2.5 py-[6px] rounded-md text-[12px] font-medium mb-[2px] transition-all ${
        active
          ? "bg-gradient-to-br from-[var(--nav-active-1)] to-[var(--nav-active-2)] text-brand font-semibold shadow-soft-sm"
          : "text-ink-2 hover:bg-page"
      }`}
    >
      <span className="w-[13px] h-[13px] flex-shrink-0">
        <Icon name={icon} className="w-[13px] h-[13px]" />
      </span>
      <span className="flex-1 truncate">{name}</span>
      {dotStatus && (
        <span
          className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
            dotStatus === "live" ? "bg-good" : "bg-border-strong"
          }`}
        />
      )}
    </Link>
  );
}
