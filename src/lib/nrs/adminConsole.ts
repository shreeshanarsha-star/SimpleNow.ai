import { NRS_ADMIN_BASE } from "./tabs";

// NR Synergy Admin Console: the section registry shared by the console
// layout (server) and its sidebar (client). The console lives at its own
// path with its own sign-in; the employee app never links to these.

export type AdminSectionKey = "overview" | "users" | "countries" | "approvals" | "content" | "contracts" | "demo";

export interface AdminSectionDef {
  key: AdminSectionKey;
  href: string;
  icon: string;
}

export const ADMIN_LOGIN_PATH = `${NRS_ADMIN_BASE}/login`;

export const ADMIN_SECTIONS: readonly AdminSectionDef[] = [
  { key: "overview", href: NRS_ADMIN_BASE, icon: "grid" },
  { key: "users", href: `${NRS_ADMIN_BASE}/users`, icon: "users" },
  { key: "countries", href: `${NRS_ADMIN_BASE}/countries`, icon: "globe" },
  { key: "approvals", href: `${NRS_ADMIN_BASE}/approvals`, icon: "check" },
  { key: "content", href: `${NRS_ADMIN_BASE}/content`, icon: "book" },
  { key: "contracts", href: `${NRS_ADMIN_BASE}/contracts`, icon: "penSignature" },
  { key: "demo", href: `${NRS_ADMIN_BASE}/demo`, icon: "database" },
];

/** Only same-console paths are accepted as a post-sign-in destination. */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next) return NRS_ADMIN_BASE;
  if (next !== NRS_ADMIN_BASE && !next.startsWith(`${NRS_ADMIN_BASE}/`)) return NRS_ADMIN_BASE;
  if (next.startsWith(ADMIN_LOGIN_PATH) || next.includes("//") || next.includes("\\")) return NRS_ADMIN_BASE;
  return next;
}
