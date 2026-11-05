// Self-contained and free of app imports (the lead context imports it with plain Node): the amount of an offer request. The browser (inline check) and
// the server (POST /api/lead) use the same functions.

/** The range of a believable offer, in the product's currency: a typo like 5 or 5,000,000 must not go out as it is. */
export type OfferBounds = { min: number; max: number };

/** Defaults relative to the asking price: from half of it to three times it (a product may say otherwise, `offerAmount` in product.json). */
export const DEFAULT_MIN_SHARE = 0.5;
export const DEFAULT_MAX_SHARE = 3;

/** The range for a product: its own `offerAmount` where given (one end or both), else the shares of the price. null when there is no price to go by (a price of 0). */
export function offerBounds(price: number, own?: { min?: number; max?: number }): OfferBounds | null {
  const min = own?.min ?? (price > 0 ? Math.round(price * DEFAULT_MIN_SHARE) : undefined);
  const max = own?.max ?? (price > 0 ? Math.round(price * DEFAULT_MAX_SHARE) : undefined);
  return min !== undefined && max !== undefined && max > min ? { min, max } : null;
}

/** The decimal and the group separator of a locale ("de-DE": "," and "."; "en-GB": "." and ","), from Intl, so a new language needs nothing here. */
export function separatorsOf(locale: string): { decimal: string; group: string } {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);
    return { decimal: parts.find((p) => p.type === "decimal")?.value ?? ",", group: parts.find((p) => p.type === "group")?.value ?? "." };
  } catch {
    return { decimal: ",", group: "." };
  }
}

/**
 * The number in what a visitor typed, read by the page language's way of writing numbers (`locale`, "de-DE" when none): where the comma is the decimal separator
 * (German, Turkish, Bulgarian) "50.000" is fifty thousand and "49500,5" is 49,500.50; where the dot is (English) "50,000" is fifty thousand and "49,500.50" is
 * 49,500.50. Spaces ("50 000") and a number without separators ("50000") read the same everywhere. NaN when there is nothing, or it is not a number.
 */
export function parseAmount(value: unknown, locale = "de-DE"): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const { decimal } = separatorsOf(locale);
  const group = decimal === "," ? "." : ",";
  const s = value.trim().replace(/[\s  ']/g, "").split(group).join("").replace(decimal, ".");
  return s === "" || !/^\d+(\.\d+)?$/.test(s) ? NaN : Number(s);
}

/** A number as the visitor's language writes it, without a currency ("53.900", "53,900", "49.500,5"): what the amount field starts with and what it shows after a blur. */
export function formatAmount(n: number, locale = "de-DE"): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
}

/** An amount as the visitor's language writes it, for the amount field after it lost focus: "50.000" (German), "50,000" (English), "49.500,5". What is no number stays as typed. */
export function formatAmountInput(value: unknown, locale = "de-DE"): string {
  const n = parseAmount(value, locale);
  if (!Number.isFinite(n) || n <= 0) return typeof value === "string" ? value : "";
  return formatAmount(n, locale);
}

/** A space where Intl puts a no-break space: plain text reads the same, and a test or a document can write the space as it is. */
const plain = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

/** An amount in the product's currency, in a locale ("53.900 €", "€53,900"); whole numbers without decimals. */
export function moneyText(amount: number, currency: string | undefined, locale: string): string {
  try {
    return plain(new Intl.NumberFormat(locale, { style: "currency", currency: currency ?? "EUR", maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount));
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

/** "−3.900 € (−7,2 %)": the sign, the difference to the asking price and the same as a share of it ("±0 € (±0,0 %)" for the asking price itself). Needs a price above 0. */
export function differenceText(amount: number, price: number, currency: string | undefined, locale: string): string {
  const diff = amount - price;
  const sign = diff < 0 ? "−" : diff > 0 ? "+" : "±";
  const share = plain(new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(diff) / price));
  return `${sign}${moneyText(Math.abs(diff), currency, locale)} (${sign}${share})`;
}

/** Why an amount is not acceptable: "invalid" (not a number) or "range" (outside the bounds); null when it is fine. Bounds null: only "invalid" is checked. */
export function amountProblem(amount: number, bounds: OfferBounds | null): "invalid" | "range" | null {
  if (!Number.isFinite(amount) || amount <= 0) return "invalid";
  if (bounds && (amount < bounds.min || amount > bounds.max)) return "range";
  return null;
}
