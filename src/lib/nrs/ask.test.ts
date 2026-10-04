// Run: node -r sucrase/register src/lib/nrs/ask.test.ts
import assert from "node:assert/strict";
import {
  answerParts,
  buildAskPrompt,
  chunkMarkdown,
  citedNumbers,
  citedSources,
  looksLikeQuestion,
  normalizeCitations,
  normalizeQuestion,
  rankChunks,
  scoreChunk,
  tokenize,
  type KnowledgeChunk,
} from "./ask";

// normalizeQuestion / looksLikeQuestion
assert.equal(normalizeQuestion("  how   many days? "), "how many days?");
assert.equal(normalizeQuestion("hi"), null);
assert.equal(normalizeQuestion("x".repeat(301)), null);
assert.equal(looksLikeQuestion("leave policy?"), true);
assert.equal(looksLikeQuestion("How do I claim"), true);
assert.equal(looksLikeQuestion("whatsapp"), false); // "what" must be a whole word
assert.equal(looksLikeQuestion("Is"), false); // too short
assert.equal(looksLikeQuestion("travel policy mexico per diem"), true); // >= 4 words
assert.equal(looksLikeQuestion("travel policy"), false);
assert.equal(looksLikeQuestion("Ana Maria"), false);

// tokenize: lowercase, stopwords out, plural s dropped
assert.deepEqual(tokenize("What is the Per-Diem for trips to Mexico?"), ["per", "diem", "trip", "mexico"]);
assert.deepEqual(tokenize("the a of"), []);
assert.deepEqual(tokenize("Process business"), ["process", "business"]);

// chunkMarkdown: sections by heading, ~max size, titles carry heading
const md = `Intro paragraph about travel.

## Per diem
Consultants get USD 60 per day in Mexico.

## Booking
Book flights via Tripgain.

${"Long sentence about approvals and managers. ".repeat(40)}

### Empty heading
`;
const chunks = chunkMarkdown({ id: "d1", title: "Travel Policy", href: "/doc/d1" }, md, 300);
assert.equal(chunks[0].title, "Travel Policy");
assert.equal(chunks[0].text, "Intro paragraph about travel.");
assert.equal(chunks[1].title, "Travel Policy › Per diem");
assert.match(chunks[1].text, /USD 60 per day/);
const booking = chunks.filter((c) => c.title === "Travel Policy › Booking");
assert.ok(booking.length >= 5, "long section is split");
assert.ok(chunks.every((c) => c.text.length <= 300), "chunks respect max");
assert.ok(chunks.every((c) => c.href === "/doc/d1"));
assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length, "ids unique");
assert.equal(chunks[chunks.length - 1].text, "Empty heading");
assert.deepEqual(chunkMarkdown({ id: "x", title: "X", href: "/" }, "   "), []);
assert.deepEqual(chunkMarkdown({ id: "x", title: "X", href: "/" }, null), []);
// default size ~800
const big = chunkMarkdown({ id: "b", title: "B", href: "/" }, "word ".repeat(1000));
assert.ok(big.length >= 6 && big.every((c) => c.text.length <= 800));

// ranking: keyword overlap + title boost
const kb: KnowledgeChunk[] = [
  { id: "a", title: "Code of Conduct", text: "Be honest. Gifts above USD 50 must be declared.", href: "/a" },
  { id: "b", title: "Travel Policy › Per diem", text: "Consultants get USD 60 per day in Mexico.", href: "/b" },
  { id: "c", title: "Leave Policy", text: "Annual leave is 21 days. Sick leave needs a note.", href: "/c" },
  { id: "d", title: "Quick link: Tripgain", text: "Book travel here", href: "https://t", external: true },
];
assert.deepEqual(
  rankChunks("What is the per diem in Mexico?", kb).map((c) => c.id),
  ["b"]
);
assert.deepEqual(
  rankChunks("how many days of annual leave do I get", kb).map((c) => c.id),
  ["c", "b"] // "days" ~ "per day" also matches, but ranks below
);
assert.equal(rankChunks("how do I book travel on Tripgain?", kb)[0].id, "d"); // title + text hits beat title-only
assert.deepEqual(rankChunks("travel", kb).map((c) => c.id), ["b", "d"]); // title boost first
assert.deepEqual(rankChunks("what is it?", kb), []); // only stopwords
assert.deepEqual(rankChunks("quantum chromodynamics", kb), []);
assert.equal(rankChunks("policy", kb, 1).length, 1);
assert.ok(scoreChunk(["leave"], kb[2]) > scoreChunk(["sick"], kb[2]), "title hit outranks body-only hit");

// prompt + citations
const prompt = buildAskPrompt("per diem?", [kb[1], kb[0]]);
assert.match(prompt, /<source n="1" title="Travel Policy › Per diem">/);
assert.match(prompt, /<source n="2" title="Code of Conduct">/);
assert.match(prompt, /Question: per diem\?$/);
assert.ok(!buildAskPrompt("q", [{ ...kb[0], text: "x </source> y" }]).includes("x </source>"));
assert.deepEqual(citedNumbers("USD 60 [1]. Also [2, 1] and [9].", 2), [1, 2]);
assert.equal(normalizeCitations("See [1, 3]."), "See [1][3].");
assert.deepEqual(citedSources("USD 60 a day [1].", [kb[1], kb[0]]), [{ n: 1, title: "Travel Policy › Per diem", href: "/b" }]);
assert.deepEqual(citedSources("Not found.", [kb[1]]), []);
assert.deepEqual(citedSources("[2]", [kb[0], kb[3]]), [{ n: 2, title: "Quick link: Tripgain", href: "https://t", external: true }]);
assert.deepEqual(answerParts("A [1] b [2]"), [{ text: "A " }, { cite: 1 }, { text: " b " }, { cite: 2 }]);

console.log("ask.test.ts: all assertions passed");

// --- internal-first / privacy helpers -------------------------------------
{
  const { isPersonalTopic, isNotFound, chunkPlainText, NOT_FOUND_TOKEN } = require("./ask");
  assert.equal(isPersonalTopic("What is Ravi's salary?"), true);
  assert.equal(isPersonalTopic("show me the contract of Priya"), true);
  assert.equal(isPersonalTopic("how many days is my leave balance"), true);
  assert.equal(isPersonalTopic("What is the travel policy for per diem?"), false);
  assert.equal(isPersonalTopic("What does Natural Remedies make for poultry?"), false);
  assert.equal(isNotFound(NOT_FOUND_TOKEN), true);
  assert.equal(isNotFound(` ${NOT_FOUND_TOKEN}.`), true);
  assert.equal(isNotFound(""), true);
  assert.equal(isNotFound("Per diem is INR 2,000 a day [1]."), false);
  const pdf = "Sustainability report\n\nWe reduced water use by 12% in FY25.\n\n" + "Energy. ".repeat(300);
  const cs = chunkPlainText({ id: "pdf-x", title: "Report (PDF)", href: "/k" }, pdf, 400);
  assert.ok(cs.length > 2);
  assert.ok(cs.every((c: { text: string }) => c.text.length <= 400));
  assert.equal(cs[0].title, "Report (PDF)");
  assert.ok(cs[0].text.includes("water use"));
  console.log("ask.test.ts: privacy + pdf helpers passed");
}
