import { enModules } from "./en/index";

// NR Synergy English strings. All UI copy lives here (shell) or in
// ./en/<module>.ts (feature modules, merged via ./en/index.ts).
// Placeholders use {name} and are filled by t(path, vars).

const base = {
  common: {
    appName: "NR Synergy",
    loading: "Loading…",
    error: "Something went wrong. Please try again.",
    retry: "Try again",
    save: "Save",
    cancel: "Cancel",
    submit: "Submit",
    close: "Close",
    edit: "Edit",
    delete: "Delete",
    confirm: "Confirm",
    search: "Search",
    empty: "Nothing here yet.",
    comingSoon: "Coming in this build",
    comingSoonBody: "This section is being built. It will appear here for everyone once it's ready.",
    notAvailableTitle: "Not available",
    featureOff: "This section is switched off for your account. Ask HR if you need it.",
    hrOnly: "Only HR admins can open this page.",
    managersOnly: "This page is for people managers.",
    welcome: "Welcome, {name}",
    welcomeBody: "Your day at Natural Remedies, in one place.",
    noAccessTitle: "You don't have access to NR Synergy yet",
    noAccessBody: "Ask your admin to add you as a member. Once you're added, this page will open automatically.",
    signInTitle: "Sign in to continue",
    signInBody: "You need to sign in to open NR Synergy.",
    signIn: "Sign in",
    licenceTitle: "NR Synergy isn't available",
  },
  nav: {
    label: "NR Synergy sections",
    home: "Home",
    time: "Time",
    money: "Money",
    projects: "Projects",
    people: "People",
    knowledge: "Knowledge",
    help: "Help",
    team: "Team",
    admin: "Admin",
    soon: "Soon",
  },
} as const;

export const en = { ...base, ...enModules } as const;

export type EnStrings = typeof en;

// "common.save" | "nav.home" | ... for every string leaf.
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type NrsStringKey = Leaves<EnStrings>;

/**
 * Look up a string by dot path and fill {placeholders}.
 * Unknown paths return the path itself so a missing key is visible, not blank.
 */
export function t(path: NrsStringKey | (string & {}), vars?: Record<string, string | number>): string {
  let node: unknown = en;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  if (typeof node !== "string") return path;
  if (!vars) return node;
  return node.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
