import type { NrsStringKey } from "./i18n/en";

// NR Synergy tab registry, shared by the layout (server) and NrsNav (client).
//
// `built`: flip to true when a module ships. Until then the tab is shown to
// HR only (marked "soon"); employees never see unbuilt tabs.

export type NrsTabKey = "home" | "time" | "money" | "projects" | "people" | "knowledge" | "help" | "team";

export interface NrsTabDef {
  key: NrsTabKey;
  href: string;
  label: NrsStringKey;
  icon: string;
  /** nrs_features key gating this tab; undefined = not switchable. */
  feature?: string;
  audience: "all" | "manager" | "hr";
  built: boolean;
}

export const NRS_BASE = "/tools/nr-synergy";

export const NRS_TABS: readonly NrsTabDef[] = [
  { key: "home", href: NRS_BASE, label: "nav.home", icon: "home", feature: "home", audience: "all", built: true },
  { key: "time", href: `${NRS_BASE}/time`, label: "nav.time", icon: "clock", feature: "time", audience: "all", built: true },
  { key: "money", href: `${NRS_BASE}/money`, label: "nav.money", icon: "dollar", feature: "money", audience: "all", built: true },
  { key: "projects", href: `${NRS_BASE}/projects`, label: "nav.projects", icon: "chart", feature: "projects", audience: "all", built: true },
  { key: "people", href: `${NRS_BASE}/people`, label: "nav.people", icon: "users", feature: "people", audience: "all", built: true },
  { key: "knowledge", href: `${NRS_BASE}/knowledge`, label: "nav.knowledge", icon: "book", feature: "knowledge", audience: "all", built: true },
  { key: "help", href: `${NRS_BASE}/help`, label: "nav.help", icon: "headset", feature: "help", audience: "all", built: true },
  { key: "team", href: `${NRS_BASE}/team`, label: "nav.team", icon: "check", audience: "manager", built: true },
];

/**
 * The separate NR Synergy Admin Console (own path, layout and sign-in).
 * Deliberately NOT an employee tab: the employee app never links to it,
 * except the HR-only "Open Admin Console" global-search result.
 */
export const NRS_ADMIN_BASE = "/nr-synergy-admin";

export function nrsTab(key: NrsTabKey): NrsTabDef {
  const tab = NRS_TABS.find((t) => t.key === key);
  if (!tab) throw new Error(`Unknown NR Synergy tab ${key}`);
  return tab;
}

/** Can someone with these flags open this tab (ignoring `built`)? */
export function canOpenTab(
  tab: NrsTabDef,
  who: { features: Record<string, boolean>; isManager: boolean; isHr: boolean }
): boolean {
  if (tab.audience === "hr" && !who.isHr) return false;
  if (tab.audience === "manager" && !who.isManager && !who.isHr) return false;
  if (tab.feature && !who.features[tab.feature]) return false;
  return true;
}
