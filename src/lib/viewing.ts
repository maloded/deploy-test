// Self-contained and free of app imports (plain functions on plain data): viewing settings, the preferred slots of a
// viewing or test-drive request, and every date rule around them. The form and the server use the same code.
//
// All dates are the SELLER's: "today", "tomorrow" and the 60-day horizon are calendar days in the seller's time zone,
// computed with calendar arithmetic (never "+ 24 hours"), so a daylight-saving change cannot shift or skip a day.

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

/** Localized text as plain data (language code -> text). */
export type Texts = Record<string, string>;

/** What a seller.json or product.json holds: every field optional, so a product can override single fields. */
export type ViewingSettings = {
  address?: Texts;
  days?: Day[];
  /** "HH:MM", 24 hours, seller-local. */
  from?: string;
  to?: string;
  durationMinutes?: number;
  /** IANA name, for example "Europe/Vienna". */
  timezone?: string;
  /** What to bring. */
  notes?: Texts;
};

/** The settings after the seller's and the product's have been merged: everything a slot needs is there. */
export type ViewingConfig = {
  address: Texts;
  days: Day[];
  from: string;
  to: string;
  durationMinutes: number;
  timezone: string;
  notes?: Texts;
};

export const MIN_DURATION = 10;
export const MAX_DURATION = 240;
export const MAX_SLOTS = 3;
export const HORIZON_DAYS = 60;

export const REQUIRED_FIELDS = ["address", "days", "from", "to", "durationMinutes", "timezone"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
export const toMinutes = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
export const fromMinutes = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Whether the runtime knows this IANA time zone ("Europe/Vienna", "UTC"). */
export function isTimeZone(name: unknown): name is string {
  if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Seller first, product over it, field by field (a list or a text is replaced as a whole). undefined when neither has settings. */
export function mergeViewing(seller?: ViewingSettings, product?: ViewingSettings): ViewingSettings | undefined {
  if (!seller && !product) return undefined;
  const merged: Record<string, unknown> = { ...seller };
  for (const [key, value] of Object.entries(product ?? {})) if (value !== undefined) merged[key] = value;
  return merged as ViewingSettings;
}

/** The required fields the merged settings still lack. */
export function missingViewingFields(settings: ViewingSettings): string[] {
  return REQUIRED_FIELDS.filter((f) => settings[f] === undefined);
}

/** Problems of settings that are present: formats, from before to, the duration range, a known time zone. Each "field: message". */
export function checkViewing(s: ViewingSettings): string[] {
  const issues: string[] = [];
  if (s.days !== undefined) {
    if (s.days.length === 0) issues.push("days: needs at least one day");
    if (new Set(s.days).size !== s.days.length) issues.push("days: each day may appear only once");
    for (const d of s.days) if (!(DAYS as readonly string[]).includes(d)) issues.push(`days: "${d}" is not one of ${DAYS.join(", ")}`);
  }
  if (s.from !== undefined && !isTime(s.from)) issues.push('from: must be a time like "10:00"');
  if (s.to !== undefined && !isTime(s.to)) issues.push('to: must be a time like "17:00"');
  if (isTime(s.from) && isTime(s.to) && toMinutes(s.from) >= toMinutes(s.to)) issues.push("from: must be before to");
  if (s.durationMinutes !== undefined && !(Number.isInteger(s.durationMinutes) && s.durationMinutes >= MIN_DURATION && s.durationMinutes <= MAX_DURATION)) {
    issues.push(`durationMinutes: must be a whole number from ${MIN_DURATION} to ${MAX_DURATION}`);
  }
  if (s.timezone !== undefined && !isTimeZone(s.timezone)) issues.push('timezone: must be an IANA time zone such as "Europe/Vienna"');
  if (isTime(s.from) && isTime(s.to) && Number.isInteger(s.durationMinutes) && toMinutes(s.from) < toMinutes(s.to) && toMinutes(s.to) - toMinutes(s.from) < (s.durationMinutes as number)) {
    issues.push("durationMinutes: is longer than the time between from and to");
  }
  return issues;
}

// ---- calendar days in the seller's time zone --------------------------------------------------------------------

export type Ymd = string; // "YYYY-MM-DD"

/** True for a real calendar date written as YYYY-MM-DD. */
export function isYmd(value: unknown): value is Ymd {
  const m = typeof value === "string" ? YMD.exec(value) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

type Parts = { y: number; m: number; d: number; h: number; mi: number };

function partsAt(ms: number, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const get = (type: string) => Number(f.formatToParts(new Date(ms)).find((p) => p.type === type)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The calendar day it is in `timeZone` at `now`. */
export function todayIn(timeZone: string, now: Date = new Date()): Ymd {
  const p = partsAt(now.getTime(), timeZone);
  return `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`;
}

/** A calendar day `n` days after `ymd` (calendar arithmetic: a 23- or 25-hour day is still one day). */
export function addDays(ymd: Ymd, n: number): Ymd {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The weekday of a calendar day (the same everywhere). */
export function weekdayOf(ymd: Ymd): Day {
  const [y, m, d] = ymd.split("-").map(Number);
  return DAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

/** The first and the last day a slot may be on: tomorrow and 60 days after today, in the seller's calendar. */
export function bookingWindow(config: Pick<ViewingConfig, "timezone">, now: Date = new Date()): { min: Ymd; max: Ymd } {
  const today = todayIn(config.timezone, now);
  return { min: addDays(today, 1), max: addDays(today, HORIZON_DAYS) };
}

/**
 * The instant (epoch ms) of a seller-local date and time, or null when that local time does not exist (the hour that
 * is skipped when the clocks go forward). When it exists twice (the clocks go back) the later one is returned.
 */
export function instantOf(ymd: Ymd, hm: string, timeZone: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, Number(hm.slice(0, 2)), Number(hm.slice(3, 5)));
  let guess = asUtc;
  for (let i = 0; i < 4; i++) {
    const p = partsAt(guess, timeZone);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - asUtc;
    if (diff === 0) return guess;
    guess -= diff;
  }
  return null;
}

// ---- slots --------------------------------------------------------------------------------------------------------

/** The start times of one day: from `from` in steps of `durationMinutes`, as long as the visit ends by `to`. */
export function timeSlots(config: Pick<ViewingConfig, "from" | "to" | "durationMinutes">): string[] {
  const out: string[] = [];
  for (let t = toMinutes(config.from); t + config.durationMinutes <= toMinutes(config.to); t += config.durationMinutes) out.push(fromMinutes(t));
  return out;
}

export type Slot = { date: string; time: string };
export type SlotProblem = "format" | "past" | "horizon" | "day" | "time" | "nonexistent";

/** Why a slot is not acceptable, or null. Checks, in order: format, not before tomorrow, not after the horizon, an allowed day, a listed time, a local time that exists. */
export function slotProblem(slot: unknown, config: ViewingConfig, now: Date = new Date()): SlotProblem | null {
  if (typeof slot !== "object" || slot === null) return "format";
  const { date, time } = slot as Record<string, unknown>;
  if (!isYmd(date) || !isTime(time)) return "format";
  const window = bookingWindow(config, now);
  if (date < window.min) return "past";
  if (date > window.max) return "horizon";
  if (!config.days.includes(weekdayOf(date))) return "day";
  if (!timeSlots(config).includes(time)) return "time";
  const at = instantOf(date, time, config.timezone);
  if (at === null) return "nonexistent";
  if (at <= now.getTime()) return "past";
  return null;
}

export type SlotsProblem = SlotProblem | "count" | "duplicate";

/** The first problem of a list of slots (1 to 3, no repeats, each acceptable), or null. */
export function slotsProblem(slots: unknown, config: ViewingConfig, now: Date = new Date()): SlotsProblem | null {
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > MAX_SLOTS) return "count";
  for (const slot of slots) {
    const p = slotProblem(slot, config, now);
    if (p) return p;
  }
  const keys = slots.map((s: Slot) => `${s.date} ${s.time}`);
  return new Set(keys).size === keys.length ? null : "duplicate";
}
