// Self-contained like languages.ts (the lead context imports it with plain Node): the contact windows a visitor can pick
// ("when can we reach you?") as plain data, the seller's override and its check, and the time zone texts. A window is chosen
// by its CODE; the label (with the hours) is only for people. Which window a seller offers is DATA, never free text.
import type { Language } from "./languages.ts";

export type ContactWindow = {
  code: string;
  /** "HH:MM"; both or neither ("anytime" has none). */
  from?: string;
  to?: string;
  /** Per language, the hours included; only the seller's default language is required (the others fall back to it). */
  label: Partial<Record<Language, string>>;
};

/** The code that is always offered and is the default. */
export const ANYTIME = "anytime";
export const CODE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export const DEFAULT_CONTACT_WINDOWS: readonly ContactWindow[] = [
  { code: ANYTIME, label: { en: "Any time", de: "Jederzeit" } },
  { code: "morning", from: "09:00", to: "12:00", label: { en: "Morning (09:00–12:00)", de: "Vormittags (09:00–12:00)" } },
  { code: "afternoon", from: "12:00", to: "17:00", label: { en: "Afternoon (12:00–17:00)", de: "Nachmittags (12:00–17:00)" } },
  { code: "evening", from: "17:00", to: "20:00", label: { en: "Evening (17:00–20:00)", de: "Abends (17:00–20:00)" } },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Problems of a seller's contactWindows override, as "path: problem" lines (empty when fine). Rules: unique codes of the
 * pattern, "anytime" present (without hours), a text in at least one language, and for every other window both times with from before to.
 */
export function checkContactWindows(windows: readonly ContactWindow[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  windows.forEach((w, i) => {
    const at = `contactWindows.${i}`;
    if (!CODE_PATTERN.test(w.code)) issues.push(`${at}.code: must be lowercase letters, digits, "-" or "_", starting with a letter (at most 32 characters)`);
    if (seen.has(w.code)) issues.push(`${at}.code: "${w.code}" is used twice`);
    seen.add(w.code);
    if (w.code === ANYTIME) {
      if (w.from !== undefined || w.to !== undefined) issues.push(`${at}: "${ANYTIME}" has no hours`);
    } else if (!TIME.test(w.from ?? "") || !TIME.test(w.to ?? "")) {
      issues.push(`${at}: needs "from" and "to" as times like "09:00"`);
    } else if ((w.from as string) >= (w.to as string)) {
      issues.push(`${at}: "from" must be before "to"`);
    }
  });
  if (!seen.has(ANYTIME)) issues.push(`contactWindows: the code "${ANYTIME}" must be present`);
  return issues;
}

/** The windows a seller offers: its override, or the defaults. */
export const contactWindowsOf = (seller: { contactWindows?: readonly ContactWindow[] }): ContactWindow[] => [...(seller.contactWindows ?? DEFAULT_CONTACT_WINDOWS)];

/** The label in `lang`, else in the seller's default language, else any (the fallback rule of localized texts). */
export function windowLabel(w: ContactWindow, lang: Language, defaultLanguage: Language = "en"): string {
  return w.label[lang] ?? w.label[defaultLanguage] ?? Object.values(w.label)[0] ?? w.code;
}

export const isWindowCode = (windows: readonly ContactWindow[], code: unknown): boolean => typeof code === "string" && windows.some((w) => w.code === code);

/** The time zone the seller's times are in: the viewing settings' zone, else the seller's own `timezone`; undefined when there is none. */
export const sellerZone = (viewingZone: string | undefined, sellerTimezone: string | undefined): string | undefined => viewingZone || sellerTimezone || undefined;

// ---- the zone in words ----------------------------------------------------------------------------------------------

/** Known zones: the city in each language and the whole sentence, so no string is ever half translated. */
const KNOWN_ZONES: Record<string, { city: Record<Language, string>; hint: Record<Language, string> }> = {
  "Europe/Vienna": { city: { en: "Vienna", de: "Wien" }, hint: { en: "Times are in Vienna time.", de: "Alle Zeiten in Wiener Zeit." } },
  "Europe/Berlin": { city: { en: "Berlin", de: "Berlin" }, hint: { en: "Times are in Berlin time.", de: "Alle Zeiten in Berliner Zeit." } },
  "Europe/Zurich": { city: { en: "Zurich", de: "Zürich" }, hint: { en: "Times are in Zurich time.", de: "Alle Zeiten in Zürcher Zeit." } },
  "Europe/London": { city: { en: "London", de: "London" }, hint: { en: "Times are in London time.", de: "Alle Zeiten in Londoner Zeit." } },
};
const GENERIC_HINT: Record<Language, string> = { en: "Times are in the seller's local time.", de: "Alle Zeiten in Ortszeit des Verkäufers." };

/** The one-line hint under the window select; null without a zone. */
export function zoneHint(zone: string | undefined, lang: Language): string | null {
  if (!zone) return null;
  return (KNOWN_ZONES[zone]?.hint ?? GENERIC_HINT)[lang];
}

/** The city for a zone, for the brackets in the owner message: the table for known zones, else the last part of the zone name. */
export function zoneCity(zone: string, lang: Language): string {
  return KNOWN_ZONES[zone]?.city[lang] ?? zone.split("/").pop()!.replace(/_/g, " ");
}

/** "2026-06-10 12:05" for an instant in a zone. */
export function localStamp(iso: string, zone: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

