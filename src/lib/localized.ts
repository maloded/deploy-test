// Self-contained like languages.ts (scripts import it with plain Node), hence the .ts extension.
import { isLanguage, LANGUAGES, type Language } from "./languages.ts";

/**
 * The fallback rule. Only the seller's defaultLanguage is required in every localized field; the other languages the
 * seller offers are optional and fall back to the default language. A missing translation is a warning (a field path),
 * never an error. A "localized field" is a JSON object whose keys are all language codes of the registry.
 */
export type Dict = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether a value is a localized text: a non-empty object whose keys are all registry languages. */
export function isLocalized(v: unknown): v is Partial<Record<Language, string>> {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every(isLanguage);
}

/** Every localized field of a parsed JSON value, with its dotted path (for example "faq.2.a"). */
export function localizedFields(value: unknown, prefix = ""): { path: string; text: Partial<Record<Language, string>> }[] {
  if (isLocalized(value)) return [{ path: prefix, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => localizedFields(v, prefix ? `${prefix}.${i}` : String(i)));
  if (isPlainObject(value)) return Object.entries(value).flatMap(([k, v]) => localizedFields(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

export type Coverage = { language: Language; translated: number; total: number; percent: number };

export type LocalizedReport = {
  /** Fields without a text in the default language (an error for the loader). */
  missingDefault: string[];
  /** Per offered language other than the default: the paths with no text (they fall back to the default). */
  missing: Partial<Record<Language, string[]>>;
  /** Per offered language, in the order of `languages`. */
  coverage: Coverage[];
};

/** Reports the localized fields of `value` against the languages a seller offers. */
export function reportLocalized(value: unknown, languages: readonly Language[], defaultLanguage: Language): LocalizedReport {
  const fields = localizedFields(value);
  const missing: LocalizedReport["missing"] = {};
  const coverage = languages.map((language) => {
    const absent = fields.filter((f) => !f.text[language]).map((f) => f.path);
    if (language !== defaultLanguage && absent.length) missing[language] = absent;
    const total = fields.length;
    const translated = total - absent.length;
    return { language, translated, total, percent: total === 0 ? 100 : Math.round((translated / total) * 100) };
  });
  return { missingDefault: fields.filter((f) => !f.text[defaultLanguage]).map((f) => f.path), missing, coverage };
}

/** A copy of `value` in which every localized field has the text of the default language wherever an offered language lacks one. */
export function completeLocalized<T>(value: T, languages: readonly Language[], defaultLanguage: Language): T {
  if (isLocalized(value)) {
    const base = value[defaultLanguage];
    const out: Record<string, string> = { ...(value as Record<string, string>) };
    if (base) for (const l of languages) if (!out[l]) out[l] = base;
    return out as T;
  }
  if (Array.isArray(value)) return value.map((v) => completeLocalized(v, languages, defaultLanguage)) as T;
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, completeLocalized(v, languages, defaultLanguage)])) as T;
  return value;
}

/** Adds the coverage of several files (product + seller) into one: translated and total are summed. */
export function mergeCoverage(parts: Coverage[][]): Coverage[] {
  return LANGUAGES.flatMap((language) => {
    const rows = parts.flat().filter((c) => c.language === language);
    if (rows.length === 0) return [];
    const translated = rows.reduce((n, r) => n + r.translated, 0);
    const total = rows.reduce((n, r) => n + r.total, 0);
    return [{ language, translated, total, percent: total === 0 ? 100 : Math.round((translated / total) * 100) }];
  });
}

/** "de 100% (212/212), en 87% (185/212)" */
export const coverageLine = (coverage: readonly Coverage[]): string => coverage.map((c) => `${c.language} ${c.percent}% (${c.translated}/${c.total})`).join(", ");
