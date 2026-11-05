import type { FieldDescriptor } from "./fields";
import { languageEntry, localeOf } from "./languages";
import type { Language, Localized } from "./schema";

/** Text for `lang`; the loader completes every localized text with the default language (localized.ts), so it has `lang`. For a text that did not go through the loader: English, then any text. */
export function pick(value: Localized | string, lang: Language): string {
  if (typeof value === "string") return value;
  return value[lang] ?? value.en ?? Object.values(value)[0] ?? "";
}

const PER_LABELS: Record<string, Localized> = {
  month: { en: "month", de: "Monat", tr: "ay", bg: "месец" },
  week: { en: "week", de: "Woche", tr: "hafta", bg: "седмица" },
  year: { en: "year", de: "Jahr", tr: "yıl", bg: "година" },
};

/**
 * Money for the page language: Intl's own form ("€53,900" in English), except for a language whose registry entry says the symbol follows the number
 * (de, tr, bg: "53.900 €", "53 900 €"), where the symbol is moved behind the number with a no-break space (Turkish Intl writes "€53.900").
 */
export function formatMoney(amount: number, currency: string, lang: Language): string {
  const format = new Intl.NumberFormat(localeOf(lang), { style: "currency", currency, maximumFractionDigits: 0 });
  if (!languageEntry(lang).currencyAfter) return format.format(amount);
  const parts = format.formatToParts(amount);
  const symbol = parts.filter((p) => p.type === "currency").map((p) => p.value).join("");
  const number = parts.filter((p) => !["currency", "literal", "minusSign"].includes(p.type)).map((p) => p.value).join("");
  const sign = parts.find((p) => p.type === "minusSign")?.value ?? "";
  return `${sign}${number}\u00a0${symbol}`;
}

/** Price as "€589 / month". Currency is formatted for the page language. */
export function formatPrice(amount: number, currency: string, per: string | undefined, lang: Language): string {
  const money = formatMoney(amount, currency, lang);
  return per ? `${money} / ${pick(PER_LABELS[per], lang)}` : money;
}

const UNIT_LABELS: Record<"months" | "km" | "m2", Localized> = {
  months: { en: "months", de: "Monate", tr: "ay", bg: "месеца" },
  km: { en: "km", de: "km", tr: "km", bg: "км" },
  m2: { en: "m²", de: "m²", tr: "m²", bg: "м²" },
};
const YES: Localized = { en: "Yes", de: "Ja", tr: "Evet", bg: "Да" };
const NO: Localized = { en: "No", de: "Nein", tr: "Hayır", bg: "Не" };

/** Display text for one value of a details object, from its descriptor. `currency` is price.currency. */
export function formatFieldValue(f: FieldDescriptor, value: unknown, lang: Language, currency: string): string {
  switch (f.type) {
    case "boolean":
      return pick(value ? YES : NO, lang);
    case "number": {
      const n = Number(value);
      if (f.unit === "money") {
        return formatMoney(n, currency, lang);
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
