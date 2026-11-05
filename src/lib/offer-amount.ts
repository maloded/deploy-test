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

/**
 * The number in what a visitor typed: "50.000" is fifty thousand (a dot separates thousands), "49500,5" is 49,500.5 (a comma separates the decimals),
 * "50 000" and "50000" too. NaN when there is nothing, or it is not a number.
 */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const s = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return s === "" || !/^\d+(\.\d+)?$/.test(s) ? NaN : Number(s);
}

/** Why an amount is not acceptable: "invalid" (not a number) or "range" (outside the bounds); null when it is fine. Bounds null: only "invalid" is checked. */
export function amountProblem(amount: number, bounds: OfferBounds | null): "invalid" | "range" | null {
  if (!Number.isFinite(amount) || amount <= 0) return "invalid";
  if (bounds && (amount < bounds.min || amount > bounds.max)) return "range";
  return null;
}
