// Department / AI-Systems taxonomy for the console.
//
// `status` and each tool's `s` field are the SOURCE OF TRUTH for what's
// actually built vs. not — never hardcode "live" for something that isn't
// wired to a real backend yet. This mirrors the console mockup you
// reviewed, but with honest statuses for the real build (the mockup used
// aspirational statuses for design purposes only).

export type ToolStatus = "live" | "soon";

export interface Tool {
  n: string; // name
  s: ToolStatus;
  group?: string; // sub-group within a department (e.g. "Talent Acquisition")
  href?: string; // route, once built
}

export interface Department {
  id: string;
  name: string;
  icon: string;
  status: ToolStatus;
  desc: string;
  tools: Tool[];
}

export const DEPARTMENTS: Department[] = [
  {
    id: "executive",
    name: "Executive",
    icon: "briefcase",
    status: "soon",
    desc: "Leadership dashboards, board reporting, and strategic decision support.",
    tools: [
      { n: "Board Deck.ai", s: "soon" },
      { n: "Strategy Copilot.ai", s: "soon" },
      { n: "Exec Briefing.ai", s: "soon" },
    ],
  },
  {
    id: "hr",
    name: "Human Resources",
    icon: "users",
    status: "live",
    desc: "Recruiting, talent, learning and rewards — the full employee lifecycle.",
    tools: [
      { n: "Talent.ai", s: "live", group: "Talent Acquisition", href: "/tools/talent-ai" },
      { n: "Job Postings.ai", s: "live", group: "Talent Acquisition", href: "/tools/job-postings-ai" },
      { n: "Apply.ai", s: "live", group: "Talent Acquisition", href: "/apply" },
      { n: "Job Board (public)", s: "live", group: "Talent Acquisition", href: "/jobs" },
      { n: "Smart Source.ai", s: "live", group: "Talent Acquisition", href: "/tools/smart-source-ai" },
      { n: "Smart Hunt.ai", s: "soon", group: "Talent Acquisition" },
      { n: "Smart Screen.ai", s: "live", group: "Talent Acquisition", href: "/tools/smart-screen-ai" },
      { n: "Assessment.ai", s: "live", group: "Talent Acquisition", href: "/tools/assessment-ai" },
      { n: "Offer.ai", s: "live", group: "Talent Acquisition", href: "/tools/offer-ai" },
      { n: "Interview.ai", s: "soon", group: "Talent Acquisition" },
      { n: "Onboard.ai", s: "soon", group: "Talent Acquisition" },
      { n: "Induction.ai", s: "soon", group: "Talent Acquisition" },
      { n: "Campus.ai", s: "soon", group: "Talent Acquisition" },
      { n: "Refer.ai", s: "soon", group: "Talent Management" },
      { n: "Performance.ai", s: "soon", group: "Talent Management" },
      { n: "Learn.ai", s: "soon", group: "Learning & Development" },
      { n: "Rewards.ai", s: "soon", group: "Total Rewards" },
      { n: "People Analytics.ai", s: "soon", group: "People Analytics" },
      { n: "HR Dashboard.ai", s: "soon", group: "People Analytics" },
    ],
  },
  {
    id: "finance",
    name: "Finance & Accounting",
    icon: "dollar",
    status: "soon",
    desc: "Admin-only, key-gated financial tooling.",
    tools: [{ n: "Margin.ai", s: "soon" }],
  },
  {
    id: "sales",
    name: "Sales",
    icon: "chart",
    status: "soon",
    desc: "Pipeline, forecasting and deal support.",
    tools: [
      { n: "Pipeline.ai", s: "soon" },
      { n: "Proposal.ai", s: "soon" },
      { n: "Forecast.ai", s: "soon" },
    ],
  },
  {
    id: "marketing",
    name: "Marketing & Brand",
    icon: "megaphone",
    status: "soon",
    desc: "Campaigns, content, brand voice and lead generation.",
    tools: [
      { n: "Leads.ai", s: "soon" },
      { n: "Campaign.ai", s: "soon" },
      { n: "Brand Voice.ai", s: "soon" },
    ],
  },
  {
    id: "product",
    name: "Product & Engineering",
    icon: "code",
    status: "soon",
    desc: "Specs, code review, and roadmap tooling for build teams.",
    tools: [
      { n: "Spec.ai", s: "soon" },
      { n: "Code Review.ai", s: "soon" },
      { n: "Roadmap.ai", s: "soon" },
    ],
  },
  {
    id: "it",
    name: "IT & Data",
    icon: "database",
    status: "soon",
    desc: "Internal systems, data pipelines, and access management.",
    tools: [
      { n: "Helpdesk.ai", s: "soon" },
      { n: "Data Pipeline.ai", s: "soon" },
      { n: "Access.ai", s: "soon" },
    ],
  },
  {
    id: "operations",
    name: "Operations",
    icon: "gear",
    status: "soon",
    desc: "Process design, SOPs, and day-to-day operational tooling.",
    tools: [
      { n: "Process.ai", s: "soon" },
      { n: "SOP.ai", s: "soon" },
      { n: "Ops Dashboard.ai", s: "soon" },
    ],
  },
  {
    id: "legal",
    name: "Legal & Compliance",
    icon: "scale",
    status: "soon",
    desc: "Contract review, policy drafting, and compliance checks.",
    tools: [
      { n: "Contract Review.ai", s: "soon" },
      { n: "Policy.ai", s: "soon" },
      { n: "Compliance Check.ai", s: "soon" },
    ],
  },
  {
    id: "support",
    name: "Customer Success & Support",
    icon: "headset",
    status: "soon",
    desc: "Ticket triage, churn signals, and support copiloting.",
    tools: [
      { n: "Ticket Triage.ai", s: "soon" },
      { n: "Churn Signal.ai", s: "soon" },
      { n: "Support Copilot.ai", s: "soon" },
    ],
  },
  {
    id: "procurement",
    name: "Procurement & Supply Chain",
    icon: "truck",
    status: "soon",
    desc: "Vendor management, purchase orders, and supply risk tooling.",
    tools: [
      { n: "Vendor.ai", s: "soon" },
      { n: "PO.ai", s: "soon" },
      { n: "Supply Risk.ai", s: "soon" },
    ],
  },
  {
    id: "rnd",
    name: "Research & Development",
    icon: "flask",
    status: "soon",
    desc: "Market research, trend scanning, and applied R&D tooling.",
    tools: [
      { n: "Market Research.ai", s: "soon" },
      { n: "Trend Scan.ai", s: "soon" },
    ],
  },
];

// Cross-cutting capability — not tied to one department, kept out of the
// department list/stats and surfaced through its own sidebar entry.
export const PERSONAL_TOOLS: Department = {
  id: "widgets",
  name: "Personal Tools",
  icon: "grid",
  status: "live",
  desc: "Small, genuinely useful everyday tools — no AI key required, available to everyone regardless of department.",
  tools: [
    { n: "Calculator", s: "live", href: "/tools/widgets-ai?tool=calculator" },
    { n: "Quick Notes", s: "live", href: "/tools/widgets-ai?tool=notes" },
    { n: "To-Do List", s: "live", href: "/tools/widgets-ai?tool=todo" },
    { n: "Calendar", s: "live", href: "/tools/widgets-ai?tool=calendar" },
    { n: "Clock", s: "live", href: "/tools/widgets-ai?tool=clock" },
    { n: "Timer / Stopwatch", s: "live", href: "/tools/widgets-ai?tool=timer" },
    { n: "Unit Converter", s: "live", href: "/tools/widgets-ai?tool=converter" },
    { n: "Contracts & eSign", s: "live", href: "/tools/contracts-esign" },
  ],
};

export const ALL_ITEMS: Department[] = [...DEPARTMENTS, PERSONAL_TOOLS];

export function liveToolCountFor(d: Department): number {
  if (d.tools.length) return d.tools.filter((t) => t.s === "live").length;
  return d.status === "live" ? 1 : 0;
}

export const totalLiveTools = DEPARTMENTS.reduce(
  (sum, d) => sum + liveToolCountFor(d),
  0
);
