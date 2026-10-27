import type { FieldDescriptor } from "./fields";
import { localeOf } from "./languages";
import type { Language, Localized } from "./schema";

/** Text for `lang`; the loader completes every localized text with the default language (localized.ts), so it has `lang`. For a text that did not go through the loader: English, then any text. */
export function pick(value: Localized | string, lang: Language): string {
  if (typeof value === "string") return value;
  return value[lang] ?? value.en ?? Object.values(value)[0] ?? "";
}

const PER_LABELS: Record<string, Localized> = {
  month: { en: "month", de: "Monat" },
  week: { en: "week", de: "Woche" },
  year: { en: "year", de: "Jahr" },
};

/** Price as "€589 / month". Currency is formatted for the page language. */
export function formatPrice(amount: number, currency: string, per: string | undefined, lang: Language): string {
  const money = new Intl.NumberFormat(localeOf(lang), { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  return per ? `${money} / ${pick(PER_LABELS[per], lang)}` : money;
}

const UNIT_LABELS: Record<"months" | "km" | "m2", Localized> = {
  months: { en: "months", de: "Monate" },
  km: { en: "km", de: "km" },
  m2: { en: "m²", de: "m²" },
};
const YES: Localized = { en: "Yes", de: "Ja" };
const NO: Localized = { en: "No", de: "Nein" };

/** Display text for one value of a details object, from its descriptor. `currency` is price.currency. */
export function formatFieldValue(f: FieldDescriptor, value: unknown, lang: Language, currency: string): string {
  switch (f.type) {
    case "boolean":
      return pick(value ? YES : NO, lang);
    case "number": {
      const n = Number(value);
      if (f.unit === "money") {
        return new Intl.NumberFormat(localeOf(lang), { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
      }
      const text = new Intl.NumberFormat(localeOf(lang)).format(n);
      return f.unit ? `${text} ${pick(UNIT_LABELS[f.unit], lang)}` : text;
    }
    case "date":
      return new Intl.DateTimeFormat(localeOf(lang), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
    case "localized":
      return pick(value as Localized, lang);
    default:
      return String(value);
  }
}
