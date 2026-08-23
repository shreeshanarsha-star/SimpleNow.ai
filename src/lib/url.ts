// Normalizes a user/AI-supplied URL (e.g. a LinkedIn profile pulled from a
// resume) so it always has an explicit scheme. Without this, a value like
// "www.linkedin.com/in/lalit-sharma" rendered in <a href> is treated as a
// path RELATIVE to the current page, producing broken links like
// "/tools/talent-ai/requisitions/www.linkedin.com/in/lalit-sharma" instead
// of navigating to LinkedIn.
export function normalizeExternalUrl(url: string | null | undefined): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
