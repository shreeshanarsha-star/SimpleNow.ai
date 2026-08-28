// Timezone-accurate time/business-hours logic. Every conversion goes
// through the browser's built-in Intl/ICU timezone database via
// Intl.DateTimeFormat -- never manual UTC-offset arithmetic -- so daylight
// saving time, historical offset changes, and multi-zone countries are all
// handled correctly for free.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
  weekdayLabel: string;
  utcOffsetMinutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  let day = date.getUTCDate();
  let hour = date.getUTCHours();
  let minute = date.getUTCMinutes();
  let second = date.getUTCSeconds();
  let weekdayLabel = "Sun";

  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    const parts = dtf.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    year = parseInt(get("year"), 10);
    month = parseInt(get("month"), 10);
    day = parseInt(get("day"), 10);
    hour = parseInt(get("hour"), 10);
    if (hour === 24) hour = 0;
    minute = parseInt(get("minute"), 10);
    second = parseInt(get("second"), 10);
    weekdayLabel = get("weekday") || weekdayLabel;
  } catch {
    // Unknown/unsupported timeZone string -- fall back to UTC fields already set above.
  }

  let utcOffsetMinutes = 0;
  try {
    const offFmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    const tzName = offFmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
    const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      const h = parseInt(m[2], 10);
      const mi = m[3] ? parseInt(m[3], 10) : 0;
      utcOffsetMinutes = sign * (h * 60 + mi);
    }
  } catch {
    utcOffsetMinutes = 0;
  }

  const weekday = WEEKDAY_INDEX[weekdayLabel] ?? new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return { year, month, day, hour, minute, second, weekday, weekdayLabel, utcOffsetMinutes };
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

export type BusinessStatus = "working" | "starting_soon" | "closed" | "night";

export interface BusinessHoursConfig {
  startHour: number; // 0-23, default business hours -- user-customizable in a future pass
  endHour: number;
}
export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = { startHour: 9, endHour: 18 };

export function businessStatus(parts: ZonedParts, cfg: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS): BusinessStatus {
  const isWeekend = parts.weekday === 0 || parts.weekday === 6;
  const minutesNow = parts.hour * 60 + parts.minute;
  const startMin = cfg.startHour * 60;
  const endMin = cfg.endHour * 60;
  const nightStart = 22 * 60;
  const nightEnd = 6 * 60;
  if (!isWeekend) {
    if (minutesNow >= startMin && minutesNow < endMin) return "working";
    if (minutesNow >= startMin - 30 && minutesNow < startMin) return "starting_soon";
  }
  if (minutesNow >= nightStart || minutesNow < nightEnd) return "night";
  return "closed";
}

export function businessStatusMeta(status: BusinessStatus): { label: string; dot: string; className: string } {
  switch (status) {
    case "working":
      return { label: "Working hours", dot: "🟢", className: "text-good-text" };
    case "starting_soon":
      return { label: "Starting soon", dot: "🟡", className: "text-warning" };
    case "night":
      return { label: "Night", dot: "🌙", className: "text-ink-muted" };
    default:
      return { label: "Closed", dot: "🔴", className: "text-critical" };
  }
}

export function isDaytimeGuess(hour: number): boolean {
  return hour >= 6 && hour < 18;
}

export function timeDiffLabel(userOffsetMin: number, targetOffsetMin: number): string {
  const diff = targetOffsetMin - userOffsetMin;
  if (diff === 0) return "Same time as you";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const hm = m ? `${h}h ${m}m` : `${h}h`;
  return diff > 0 ? `${hm} ahead of you` : `${hm} behind you`;
}

export function dayDiffLabel(userParts: ZonedParts, targetParts: ZonedParts): string {
  const u = Date.UTC(userParts.year, userParts.month - 1, userParts.day);
  const t = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const diffDays = Math.round((t - u) / 86400000);
  if (diffDays === 0) return "Same day";
  if (diffDays === 1) return "1 day ahead";
  if (diffDays === -1) return "1 day behind";
  return diffDays > 0 ? `${diffDays} days ahead` : `${Math.abs(diffDays)} days behind`;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function minutesToClockLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export interface ContactWindow {
  hasOverlap: boolean;
  startLabel: string | null;
  endLabel: string | null;
}

// The overlap between the user's business hours and the target's business
// hours, expressed entirely in the user's local clock -- e.g. "7:30 PM -
// 10:30 PM" meaning "call between those times, your own time, and they'll
// still be at work." Computed purely from live UTC offsets (DST-aware,
// since callers pass offsets from getZonedParts at the current instant).
export function bestContactWindow(
  userOffsetMin: number,
  targetOffsetMin: number,
  cfg: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS
): ContactWindow {
  const diffMin = targetOffsetMin - userOffsetMin;
  const userStart = cfg.startHour * 60;
  const userEnd = cfg.endHour * 60;
  const tStart = mod(cfg.startHour * 60 - diffMin, 1440);
  const tEnd = mod(cfg.endHour * 60 - diffMin, 1440);

  const targetIntervals: [number, number][] = tStart <= tEnd ? [[tStart, tEnd]] : [[tStart, 1440], [0, tEnd]];
  const overlaps: [number, number][] = [];
  for (const [a, b] of targetIntervals) {
    const s = Math.max(userStart, a);
    const e = Math.min(userEnd, b);
    if (s < e) overlaps.push([s, e]);
  }
  if (!overlaps.length) return { hasOverlap: false, startLabel: null, endLabel: null };
  overlaps.sort((x, y) => y[1] - y[0] - (x[1] - x[0]));
  const [s, e] = overlaps[0];
  return { hasOverlap: true, startLabel: minutesToClockLabel(s), endLabel: minutesToClockLabel(e) };
}
