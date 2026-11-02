// The maths of the morph between the avatar card and the call bar (phones). Pure functions; the DOM is in components/bar-morph.ts, the trigger
// in components/card-flight-controller.ts. Tweak the numbers here.
import { cubicBezier, mix, mixRect, type Rect } from "./card-flight";

export const BAR_MORPH = {
  /** The morph, in ms. */
  ms: 350,
  /** The easing: ease-out, the same as the desktop flight (Hanc's --v3-ease-out). */
  ease: [0.23, 1, 0.32, 1] as const,
  /**
   * When each part is fully there, as windows [from, to] of the EASED progress (0 to 1). Going to the bar the card's layers (picture, name, captions) go first and the
   * bar's own live parts (face, the two lines, the button's place) come in as the shape gets to the bar; going back it is the other way round.
   */
  toBar: { card: [0.3, 0.78], pill: [0.66, 1] },
  toCard: { pill: [0, 0.34], card: [0.22, 0.7] },
  /** The ghost fades out over what has landed in this time, in ms. */
  crossfadeMs: 200,
} as const;

export type Dir = "toBar" | "toCard";
export type Shape = Rect & { radius: number };
/** How much of the card's layers (the ghost) and of the bar's own parts (the real bar) are shown, 0 to 1 each. */
export type Fade = { card: number; pill: number };

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
/** How far `e` is from `from` to `to`, 0 to 1. */
export const part = (e: number, from: number, to: number): number => clamp01((e - from) / (to - from));

export const ease = cubicBezier(...BAR_MORPH.ease);

export const mixShape = (a: Shape, b: Shape, e: number): Shape => ({ ...mixRect(a, b, e), radius: mix(a.radius, b.radius, e) });
export const mixBox = (a: Rect, b: Rect, e: number): Rect => mixRect(a, b, e);

/** Where the morph ends in terms of opacity: going to the bar the card's layers are gone and the bar is all there, and the other way round. */
export const fadeEnd = (dir: Dir): Fade => (dir === "toBar" ? { card: 0, pill: 1 } : { card: 1, pill: 0 });

/**
 * The fades at the eased progress `e`, from the fades the morph started with (a fresh morph starts from `fadeEnd` of the other direction; one taken over in the
 * air starts from where the fades were, so nothing jumps): each part goes from where it was to where it ends in its own window.
 */
export function fadeAt(e: number, dir: Dir, from: Fade): Fade {
  const to = fadeEnd(dir);
  const w = BAR_MORPH[dir];
  return { card: mix(from.card, to.card, part(e, w.card[0], w.card[1])), pill: mix(from.pill, to.pill, part(e, w.pill[0], w.pill[1])) };
}

/** `clip-path: inset(...)` for a shape in the viewport (the ghost's whole layer is the viewport): the rectangle with the rounded corners, nothing else. */
export function clipInset(s: Shape, vw: number, vh: number): string {
  const top = Math.max(0, s.top);
  const left = Math.max(0, s.left);
  const right = Math.max(0, vw - (s.left + s.width));
  const bottom = Math.max(0, vh - (s.top + s.height));
  return `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px round ${Math.max(0, s.radius).toFixed(2)}px)`;
}

/** The overlap of two boxes, or null when they do not touch. */
export function overlap(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/**
 * `clip-path` for the real bar while the shape is on its way: the bar's own box (which stands where it ends) cut to the part the shape covers now, so its
 * live parts appear only inside the shape. Nothing shows while they do not meet.
 */
export function clipWithin(box: Rect, s: Shape): string {
  const o = overlap(box, s);
  if (!o) return "inset(100% 100% 100% 100%)";
  const top = o.top - box.top;
  const left = o.left - box.left;
  const right = box.left + box.width - (o.left + o.width);
  const bottom = box.top + box.height - (o.top + o.height);
  return `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px round ${Math.max(0, s.radius).toFixed(2)}px)`;
}

/**
 * The elliptical corner radius that a box of the start size, scaled to `w` x `h` by a transform, shows as a round corner of `radius` px: used for the shadow layer,
 * which is moved by transform only.
 */
export const counterRadius = (radius: number, sx: number, sy: number): string => `${(radius / Math.max(sx, 0.001)).toFixed(2)}px / ${(radius / Math.max(sy, 0.001)).toFixed(2)}px`;
