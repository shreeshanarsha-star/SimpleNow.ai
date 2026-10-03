// Pure timezone / month helpers for the Time and Team modules.
// Safe to import from server and client code (no Node or Supabase imports).

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at instant `at`, in minutes (e.g. +330 for Asia/Kolkata). */
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Wall-clock "yyyy-mm-dd" + "HH:MM" in `tz` → the UTC instant (ISO string). */
export function zonedTimeToUtcIso(day: string, hhmm: string, tz: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes handle DST edges well enough for a correction request.
  let guess = naive - tzOffsetMinutes(tz, new Date(naive)) * 60000;
  guess = naive - tzOffsetMinutes(tz, new Date(guess)) * 60000;
  return new Date(guess).toISOString();
}

/** "HH:MM" of an instant in `tz`. */
export function formatTimeInTz(iso: string, tz: string): string {
  const safe = isValidTimeZone(tz) ? tz : "UTC";
  return new Intl.DateTimeFormat("en-GB", { timeZone: safe, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );
}

/** "3 Oct 2026" for a yyyy-mm-dd date (no timezone shift). */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${day}T00:00:00Z`)
  );
}

/** "October 2026" for a yyyy-mm month. */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${month}-01T00:00:00Z`)
  );
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(v: string | null | undefined): v is string {
  return !!v && MONTH_RE.test(v);
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Hours between two instants, one decimal ("7.5"). */
export function hoursBetween(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return (Math.max(0, ms) / 3600000).toFixed(1);
}
