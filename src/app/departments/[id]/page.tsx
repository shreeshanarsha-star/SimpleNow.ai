import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import HRDepartmentView from "@/components/departments/HRDepartmentView";
import { ALL_ITEMS } from "@/lib/departments";

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

  // Human Resources gets its own information architecture (workflow-based
  // Talent Acquisition journey, contextual prompt, live-vs-soon visual
  // weighting) per the HR redesign brief -- every other department keeps
  // the existing generic grouped-card list below unchanged.
  if (dept.id === "hr") {
    return <HRDepartmentView dept={dept} />;
  }

  const groups = new Map<string | undefined, typeof dept.tools>();
  for (const tool of dept.tools) {
    const key = tool.group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tool);
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

      <div className="flex flex-col gap-6">
        {Array.from(groups.entries()).map(([group, tools]) => (
          <div key={group ?? "_"}>
            {group && (
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
                {group}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tools.map((tool) => {
                const row = (
                  <div
                    className={`flex items-center gap-3 border border-border rounded-md px-4 py-3 bg-surface shadow-soft-sm ${
                      tool.s === "live" ? "hover:border-brand cursor-pointer" : "opacity-70"
                    }`}
                  >
                    <span className="text-[13.5px] font-medium flex-1">{tool.n}</span>
                    <span
                      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                        tool.s === "live"
                          ? "bg-good-wash text-good-text"
                          : "bg-page text-ink-muted"
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
              })}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
