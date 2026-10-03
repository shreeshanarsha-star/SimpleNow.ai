// NR Synergy · Global search strings (English).
// Imported directly by GlobalSearch and GET /api/nr-synergy/search; placeholders use {name}.

export const search = {
  label: "Search NR Synergy",
  placeholder: "Search people, policies, projects, tickets… (Ctrl K)",
  placeholderShort: "Search NR Synergy…",
  clear: "Clear search",
  shortcutHint: "Press {keys} to search",
  resultsLabel: "Search results",
  loading: "Searching…",
  minChars: "Type at least 2 characters to search.",
  noResultsTitle: "No results for “{query}”",
  noResultsBody: "Try another name or keyword. Still stuck?",
  raiseTicket: "Raise a Help ticket",
  error: "Search isn't available right now.",
  retry: "Try again",
  recent: "Recent searches",
  clearRecent: "Clear",
  resultCount: "{count} results",
  resultCountOne: "1 result",
  opensNewTab: "(opens in a new tab)",
  hintNavigate: "to navigate",
  hintOpen: "to open",
  hintClose: "to close",
  groups: {
    actions: "Quick actions",
    pages: "Go to",
    people: "People",
    documents: "Policies & documents",
    projects: "Projects",
    tickets: "Tickets",
    posts: "Posts",
    values: "Values",
    links: "Quick links",
  },
  pageKeywords: {
    home: ["dashboard", "feed", "news", "kudos", "events"],
    time: ["attendance", "timesheet", "leave", "check in", "holidays"],
    money: ["expenses", "invoices", "travel", "reimbursement", "payments"],
    projects: ["milestones", "status", "updates"],
    people: ["directory", "colleagues", "org chart", "employees"],
    knowledge: ["policies", "documents", "library", "handbook", "sop", "forms"],
    joe: ["values", "culture", "journey", "onboarding", "joy of excellence"],
    help: ["tickets", "support", "it", "assets", "helpdesk"],
    team: ["approvals", "my team", "reports", "manager", "leave balances"],
    desk: ["desk", "agent", "queue", "support desk", "travel desk"],
    deskSupport: ["tickets", "queue", "it agent", "hr agent", "helpdesk", "support desk"],
    deskTravel: ["bookings", "trips", "flights", "hotels", "travel desk", "book travel"],
  },
  joeTitle: "JOE",
  actions: {
    checkIn: { title: "Check in", subtitle: "Start your day in Time", keywords: ["clock in", "attendance", "start day", "check-in"] },
    applyLeave: { title: "Apply leave", subtitle: "Request time off in Time", keywords: ["leave", "vacation", "holiday", "time off", "pto", "sick"] },
    submitExpense: { title: "Submit expense", subtitle: "Claim a receipt in Money", keywords: ["expense", "receipt", "claim", "reimbursement"] },
    raiseTicket: { title: "Raise ticket", subtitle: "Ask IT, HR, payroll or admin", keywords: ["ticket", "support", "help", "issue", "problem", "request"] },
    openAdminConsole: {
      title: "Open Admin Console",
      subtitle: "Users, countries, approvals, content, contracts (HR only)",
      keywords: ["admin", "console", "settings", "members", "users", "add member", "invite", "configuration", "content", "countries", "holidays", "contracts", "demo"],
    },
  },
  progress: "{pct}% complete",
} as const;

export function fillSearch(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
