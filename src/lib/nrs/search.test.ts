// Run: node -r sucrase/register src/lib/nrs/search.test.ts
import assert from "node:assert/strict";
import {
  buildGroups,
  containsPattern,
  escapeLike,
  highlightParts,
  joinSub,
  matchStatic,
  normalizeQuery,
  orIlike,
  snippetAround,
  stripMarkdown,
  type SearchGroupKey,
} from "./search";

// normalizeQuery: trim, collapse, length bounds, drop `*`
assert.equal(normalizeQuery("  ana   maria "), "ana maria");
assert.equal(normalizeQuery("a"), null);
assert.equal(normalizeQuery(" a "), null);
assert.equal(normalizeQuery("x".repeat(80)), "x".repeat(80));
assert.equal(normalizeQuery("x".repeat(81)), null);
assert.equal(normalizeQuery("**"), null);
assert.equal(normalizeQuery("tr*vel"), "tr vel");
assert.equal(normalizeQuery(undefined), null);
assert.equal(normalizeQuery(null), null);

// escapeLike / containsPattern
assert.equal(escapeLike("50%_off\\x"), "50\\%\\_off\\\\x");
assert.equal(containsPattern("a_b"), "%a\\_b%");

// orIlike: quoted, with " and \ escaped, commas safe
assert.equal(orIlike(["full_name", "email"], "ana"), 'full_name.ilike."%ana%",email.ilike."%ana%"');
assert.equal(orIlike(["t"], 'a,b"c'), 't.ilike."%a,b\\"c%"');
assert.equal(orIlike(["t"], "5%"), 't.ilike."%5\\\\%%"');

// matchStatic: every token must appear in title + keywords
const entries = [
  { id: "a1", title: "Check in", keywords: ["clock in", "attendance"], href: "/time" },
  { id: "a2", title: "Apply leave", keywords: ["vacation", "time off"], href: "/time" },
  { id: "a3", title: "Raise ticket", keywords: ["support"], href: "/help" },
];
assert.deepEqual(
  matchStatic("check in", entries).map((e) => e.id),
  ["a1"]
);
assert.deepEqual(
  matchStatic("LEAVE", entries).map((e) => e.id),
  ["a2"]
);
assert.deepEqual(
  matchStatic("time off", entries).map((e) => e.id),
  ["a2"]
);
assert.deepEqual(matchStatic("in", entries, 1).length, 1);
assert.deepEqual(matchStatic("zzz", entries), []);

// buildGroups: fixed order, empty groups dropped, cap + de-dupe
const labels = {
  actions: "A",
  pages: "P",
  people: "Pe",
  documents: "D",
  projects: "Pr",
  tickets: "T",
  posts: "Po",
  values: "V",
  joe: "J",
  links: "L",
} satisfies Record<SearchGroupKey, string>;
const item = (id: string) => ({ id, title: id, href: "/" });
const groups = buildGroups(
  {
    links: [item("l1")],
    people: [item("p1"), item("p1"), item("p2"), item("p3")],
    documents: [],
    actions: [item("x")],
  },
  labels,
  2
);
assert.deepEqual(
  groups.map((g) => g.key),
  ["actions", "people", "links"]
);
assert.deepEqual(
  groups[1].items.map((i) => i.id),
  ["p1", "p2"]
);
assert.equal(groups[1].label, "Pe");

// highlightParts
assert.deepEqual(highlightParts("Travel Policy travel", "travel"), [
  { text: "Travel", match: true },
  { text: " Policy ", match: false },
  { text: "travel", match: true },
]);
assert.deepEqual(highlightParts("Ana", "zz"), [{ text: "Ana", match: false }]);
assert.deepEqual(highlightParts("Ana", ""), [{ text: "Ana", match: false }]);

// joinSub
assert.equal(joinSub("HR", null, " ", "MX"), "HR · MX");
assert.equal(joinSub(null, ""), null);

// stripMarkdown
assert.equal(
  stripMarkdown("# Travel *policy*\n\n- Book via **Tripgain** [portal](https://x.y)\n> note `code`"),
  "Travel policy Book via Tripgain portal note code"
);
assert.equal(stripMarkdown("file_name_here and _em_"), "file_name_here and em");
assert.equal(stripMarkdown("| a | b |\n|---|---|\n| 1 | 2 |"), "a b 1 2");
assert.equal(stripMarkdown(null), "");

// snippetAround
const long = `${"alpha ".repeat(40)}per diem is USD 60 per day ${"omega ".repeat(40)}`;
const snip = snippetAround(long, "per diem");
assert.ok(snip && snip.includes("per diem"));
assert.ok(snip!.startsWith("…") && snip!.endsWith("…"));
assert.ok(snip!.length <= 145, `snippet too long: ${snip!.length}`);
assert.equal(snippetAround("Short text about leave", "leave"), "Short text about leave");
assert.equal(snippetAround("Short text", "zzz"), null);
assert.ok(snippetAround(long, "the per diem rate")?.includes("diem")); // falls back to a word

console.log("search.test.ts: all assertions passed");
