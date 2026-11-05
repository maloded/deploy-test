/**
 * Fitting the hero's key facts into ONE row on a wide window, whatever the language, the theme's fonts or the length of a value.
 *
 * A fact needs at least the wider of its value (one line, at the current size times `scale`) and its label (its longest word, the label wraps); the facts sit in
 * one row with `gap` between them. This finds the largest scale between `min` and 1 at which the row fits `available`. When even `min` does not fit, the values
 * may wrap inside their own tiles (`wrap`), they never go into a second row.
 */
export type FactNeed = { value: number; label: number };

export const FACT_MIN_SCALE = 0.8;

/** The widest row the one-row rule is applied to: narrower (a tablet) the two pairs may still stand one under the other, as before. */
export const FACT_ROW_MIN_WIDTH = 640;

export function factRowWidth(needs: readonly FactNeed[], scale: number, gap: number): number {
  return needs.reduce((sum, n) => sum + Math.max(n.value * scale, n.label), 0) + gap * Math.max(0, needs.length - 1);
}

export function fitFacts(needs: readonly FactNeed[], available: number, gap: number, min = FACT_MIN_SCALE): { scale: number; wrap: boolean } {
  if (needs.length === 0 || factRowWidth(needs, 1, gap) <= available) return { scale: 1, wrap: false };
  if (factRowWidth(needs, min, gap) > available) return { scale: min, wrap: true };
  let lo = min; // fits
  let hi = 1; // does not fit
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (factRowWidth(needs, mid, gap) <= available) lo = mid;
    else hi = mid;
  }
  return { scale: Math.floor(lo * 1000) / 1000, wrap: false };
}

/**
 * The scale (between `min` and 1) at which a line of `natural` width fits `available`: the line keeps its size when it fits, shrinks to fit within the limit, and at
 * the limit it stays (the CSS then clips it with an ellipsis, it never wraps). Used for the invitation heading above the agent's card.
 */
/** A line is fitted to 97% of its room: the measured text and the box are rounded differently, and a line that is exactly as wide as its box would end in an ellipsis. */
const FIT_MARGIN = 0.97;

export function fitLine(natural: number, available: number, min = 0.75): number {
  if (!(natural > 0) || !(available > 0) || natural <= available * FIT_MARGIN) return 1;
  return Math.max(min, Math.floor(((available * FIT_MARGIN) / natural) * 1000) / 1000);
}
