// Team Chat -- shared @mention parsing.
//
// Kept deliberately simple for v1: no special encoding in the stored
// message text, just plain "@Full Name" (or "@email-local-part")
// substrings. The composer's autocomplete inserts a member's exact
// display token, and both the server (to fan out notifications) and the
// client (to highlight mentions when rendering) re-run this same match
// against the same member list -- so they always agree.

export interface ChatMember {
  id: string;
  displayName: string; // full_name if set, else the email local-part
}

export function memberDisplayName(m: { full_name?: string | null; email?: string | null }): string {
  if (m.full_name && m.full_name.trim()) return m.full_name.trim();
  if (m.email) return m.email.split("@")[0];
  return "Member";
}

/**
 * Returns the member ids whose "@DisplayName" token appears in `body`,
 * matched at a word boundary, case-insensitive. Longer names are checked
 * first so "@Sam Patel" doesn't get eaten by a shorter "@Sam" false match.
 */
export function parseMentions(body: string, members: ChatMember[]): string[] {
  const found = new Set<string>();
  const sorted = [...members].sort((a, b) => b.displayName.length - a.displayName.length);

  for (const m of sorted) {
    const token = `@${m.displayName}`;
    const idx = body.toLowerCase().indexOf(token.toLowerCase());
    if (idx === -1) continue;
    const before = idx === 0 ? " " : body[idx - 1];
    const after = body[idx + token.length];
    const boundaryBefore = /\s/.test(before) || before === undefined;
    const boundaryAfter = after === undefined || /[\s.,!?;:]/.test(after);
    if (boundaryBefore && boundaryAfter) found.add(m.id);
  }
  return Array.from(found);
}

/** Splits a message body into plain-text and mention segments for rendering. */
export function splitMentions(
  body: string,
  members: ChatMember[]
): Array<{ text: string; mention: boolean }> {
  if (!members.length) return [{ text: body, mention: false }];

  const tokens = [...members]
    .sort((a, b) => b.displayName.length - a.displayName.length)
    .map((m) => `@${m.displayName}`);

  const pattern = new RegExp(
    `(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );

  const parts = body.split(pattern);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => ({
      text: part,
      mention: tokens.some((t) => t.toLowerCase() === part.toLowerCase()),
    }));
}
