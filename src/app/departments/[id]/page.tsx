import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { ALL_ITEMS, PERSONAL_TOOLS, type Tool } from "@/lib/departments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return ALL_ITEMS.map((d) => ({ id: d.id }));
}

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dept = ALL_ITEMS.find((d) => d.id === id);
  if (!dept) notFound();
  const d = dept;

  // Personal Tools is a cross-cutting utility set available to everyone
  // regardless of org/plan -- never license-gated. Every other department's
  // tool list is filtered down to exactly what the signed-in user's
  // organization is licensed for (mirrors Sidebar.tsx + requireFeatureAccess).
  const bypassLicense = dept.id === PERSONAL_TOOLS.id;

  let visibleTools: Tool[] = d.tools;
  let gateMessage: string | null = null;
  let filteredByLicense = false;

  if (!bypassLicense) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Guests browse the full, unfiltered tool list for this department --
      // same "see everything, sign in to use it" rule as Sidebar. Clicking
      // into a live tool hits middleware's /tools/** auth redirect, so
      // nothing here needs to gate the browsing view itself.
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, org_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.is_admin) {
        // Platform owner -- sees every tool except Talent.ai. He manages
        // orgs/approvals/grants at the platform level and isn't a
        // recruiter/hiring-manager/approver in anyone's Talent.ai workflow,
        // so it's hidden from his own nav; he checks a customer's Talent.ai
        // usage from that org's row in the Owner Console (/admin/organizations)
        // instead. Scoped to just this one tool for now -- every other live
        // tool stays unfiltered for him.
        visibleTools = d.tools.filter((t) => t.n !== "Talent.ai");
      } else if (!profile?.org_id) {
        visibleTools = [];
        gateMessage =
          "Your account isn't part of an organization yet. Ask your admin to add you.";
      } else {
        const { data: org } = await supabase
          .from("organizations")
          .select("plan, status")
          .eq("id", profile.org_id)
          .maybeSingle();

        if (org?.status !== "approved") {
          visibleTools = [];
          gateMessage = "Your organization is still pending approval from the platform owner.";
        } else if (org.plan === "bulk") {
          // Bulk-plan org -- every tool in the department, no per-tool grant needed.
        } else {
          const { data: grants } = await supabase
            .from("feature_access")
            .select("feature_key")
            .eq("org_id", profile.org_id);
          const grantedKeys = new Set((grants || []).map((g) => g.feature_key));
          // Bundled tools (e.g. Team Chat) need no feature_access grant --
          // every approved org gets them automatically, same rule as
          // Sidebar.tsx and requireOrgMember().
          visibleTools = d.tools.filter((t) => t.bundled || grantedKeys.has(t.n));
          filteredByLicense = true;
          if (visibleTools.length === 0) {
            gateMessage =
              "Your organization doesn't have access to any tools in this department yet. Ask the platform owner to grant access.";
          }
        }
      }
    }
  }

  const groups = new Map<string | undefined, Tool[]>();
  for (const tool of visibleTools) {
    const key = tool.group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tool);
  }
  const groupEntries = Array.from(groups.entries());
  const showGroupLabels = groupEntries.length > 1;

  function ToolRow({ tool, hero }: { tool: Tool; hero?: boolean }) {
    const row = hero ? (
      <div
        className={`flex flex-col items-center text-center gap-3 border border-border rounded-lg px-8 py-9 bg-surface shadow-soft-sm max-w-sm mx-auto ${
          tool.s === "live" ? "hover:border-brand cursor-pointer" : "opacity-70"
        }`}
      >
        <div className="w-12 h-12 rounded-md bg-brand-wash text-brand flex items-center justify-center">
          <Icon name={d.icon} className="w-5 h-5" />
        </div>
        <span className="text-[16px] font-bold">{tool.n}</span>
        <span
          className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full ${
            tool.s === "live" ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"
          }`}
        >
          {tool.s === "live" ? "Live" : "Soon"}
        </span>
        {tool.s === "live" && (
          <span className="text-[12.5px] font-semibold text-brand mt-1">Open &rarr;</span>
        )}
      </div>
    ) : (
      <div
        className={`flex items-center gap-3 border border-border rounded-md px-4 py-3 bg-surface shadow-soft-sm ${
          tool.s === "live" ? "hover:border-brand cursor-pointer" : "opacity-70"
        }`}
      >
        <span className="text-[13.5px] font-medium flex-1">{tool.n}</span>
        <span
          className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
            tool.s === "live" ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"
          }`}
        >
          {tool.s === "live" ? "Live" : "Soon"}
        </span>
      </div>
    );
    return tool.href && tool.s === "live" ? (
      <Link key={tool.n} href={tool.href}>
        {row}
      </Link>
    ) : (
      <div key={tool.n}>{row}</div>
    );
  }

  return (
    <AppShell title={dept.name}>
      <div className="flex items-start gap-4 pb-6">
        <div className="w-11 h-11 rounded-md bg-brand-wash text-brand flex items-center justify-center flex-shrink-0">
          <Icon name={dept.icon} className="w-5 h-5" />
        </div>
        <div>
          <h2 className="m-0 text-[19px] font-bold">{dept.name}</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-2 max-w-xl">{dept.desc}</p>
          {filteredByLicense && visibleTools.length > 0 && (
            <p className="m-0 mt-1.5 text-[11.5px] text-ink-muted">
              Showing {visibleTools.length} of {dept.tools.length} tools -- licensed to your organization.
            </p>
          )}
        </div>
        <span
          className={`ml-auto flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full ${
            dept.status === "live"
              ? "bg-good-wash text-good-text"
              : "bg-page text-ink-muted border border-border"
          }`}
        >
          <i
            className={`w-1.5 h-1.5 rounded-full ${
              dept.status === "live" ? "bg-good" : "bg-border-strong"
            }`}
          />
          {dept.status === "live" ? "Live" : "Coming soon"}
        </span>
      </div>

      {visibleTools.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg px-8 py-14 max-w-md mx-auto">
          <div className="w-11 h-11 rounded-md bg-page text-ink-muted flex items-center justify-center mb-1">
            <Icon name={dept.icon} className="w-5 h-5" />
          </div>
          <p className="m-0 text-[13.5px] font-semibold">No tools available yet</p>
          <p className="m-0 text-[12.5px] text-ink-muted max-w-xs">{gateMessage}</p>
        </div>
      ) : visibleTools.length === 1 ? (
        <div className="pt-2">
          <ToolRow tool={visibleTools[0]} hero />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupEntries.map(([group, tools]) => (
            <div key={group ?? "_"}>
              {showGroupLabels && group && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
                  {group}
                </div>
              )}
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}
              >
                {tools.map((tool) => (
                  <ToolRow key={tool.n} tool={tool} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
