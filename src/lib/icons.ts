// Feather-style icon path data, ported from the reviewed console mockup.
// Each entry is a single string of one or more SVG path "d" segments,
// separated by " M" (a literal move-to that starts a new subpath).

export const ICONS: Record<string, string> = {
  mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
  briefcase:
    "M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M8 7V5h8v2 M2 13h20",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  award:
    "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8.21 13.89 7 23l5-3 5 3-1.21-9.12",
  megaphone: "M3 11l18-5v12L3 13v-2z M11.6 16.8A3 3 0 1 1 7 15",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  gift: "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  dollar: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  sparkle:
    "M12 3l1.9 5.7L19.5 10l-5.6 1.3L12 17l-1.9-5.7L4.5 10l5.6-1.3L12 3z M19 3v4 M21 5h-4 M5 17v3 M6.5 18.5h-3",
  chart: "M18 20V10 M12 20V4 M6 20v-6",
  flask:
    "M10 2v6.3a2 2 0 0 1-.3 1L4.4 18a2 2 0 0 0 1.7 3h11.8a2 2 0 0 0 1.7-3l-5.3-8.7a2 2 0 0 1-.3-1V2 M8.5 2h7",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  code: "M8 6L2 12l6 6 M16 6l6 6-6 6",
  database: "M4 4h16v4H4z M4 10h16v4H4z M4 16h16v4H4z M7 6h.01 M7 12h.01 M7 18h.01",
  gear: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  scale:
    "M12 3v18 M8 3h8 M5 7l-3.5 7a3 3 0 0 0 7 0z M19 7l-3.5 7a3 3 0 0 0 7 0z M5 7h14",
  headset:
    "M3 18v-6a9 9 0 0 1 18 0v6 M3 18a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z M21 18a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z",
  truck:
    "M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  chevronLeft: "M15 18l-6-6 6-6",
};

export function iconPaths(name: string): string[] {
  const d = ICONS[name] || ICONS.grid;
  return d.split(" M").map((seg, i) => (i === 0 ? seg : "M" + seg).trim());
}
