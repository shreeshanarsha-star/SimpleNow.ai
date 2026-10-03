// Per-module English strings for NR Synergy.
//
// Each module adds its own file next to this one, e.g. ./people.ts:
//
//   export const people = { title: "People", search: "Search people" } as const;
//
// and registers it below (one import + one key). Keys become top-level
// namespaces in `en`, so t("people.search") resolves. Keep `common` and
// `nav` in ../en.ts; never reuse those names here.

export const enModules = {} as const;

export type EnModules = typeof enModules;
