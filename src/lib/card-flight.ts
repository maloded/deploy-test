// The constants and the pure maths of the "ghost" transition of the avatar card between the hero and the dock. Tweak the numbers here; the ghost's DOM is
// components/card-ghost.ts, the flight (start, interrupt, land) components/card-flight-controller.ts, the trigger components/use-card-placement.ts.

export const CARD_FLIGHT = {
  /** The share of the hero card (its slot) still on screen at which the card leaves (scrolling down: 0.28 or less) and comes back (scrolling up: 0.28 or more). 0.25 to 0.30 is the asked range. */
  trigger: 0.28,
  /** The flight, in ms. Hanc's entrance of the card is 760 ms (HeroStage.astro, tile and console rise 28px). */
  ms: 640,
  /** The easing, a cubic-bezier: Hanc's --v3-ease-out, the one of its card entrance and of the bubble. */
  ease: [0.23, 1, 0.32, 1] as const,
  /** The ghost fades out over the real card (which is shown at once under it) in this time, in ms. Hanc's bubble comes in over 260 ms. */
  crossfadeMs: 260,
  /** When the hero card is already beyond the top edge, the ghost starts this far above it, in card heights ("just above the top edge"). */
  entryAbove: 1.1,
  /** Space around the dock's place that the hero's content must stay out of when the card lands there, in px. */
  clearance: 8,
  /** The blocks of the hero that the docked card must not land on (looked up inside #hero): the text, the facts, the price, the buttons, the trust line. */
  keepClear: [".hero__description", ".hero__facts", ".hero__figure", ".hero__actions", ".hero__trust"],
  /** Most device pixels per CSS pixel of the snapshot (the picture of the ghost is one frame of the loop on a canvas). */
  maxDpr: 2,
  /** The widest the snapshot is, in device pixels (a loop frame is 960 wide). */
  maxSnapshotWidth: 640,
} as const;

export type Rect = { left: number; top: number; width: number; height: number };

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mixRect = (a: Rect, b: Rect, t: number): Rect => ({ left: mix(a.left, b.left, t), top: mix(a.top, b.top, t), width: mix(a.width, b.width, t), height: mix(a.height, b.height, t) });

/** A CSS cubic-bezier(x1, y1, x2, y2) as a function of the time 0..1 (Newton's method, then bisection). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i += 1) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-5) return y(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 24; i += 1) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-5) break;
      if (err > 0) hi = s;
      else lo = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}
