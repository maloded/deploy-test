// The avatar card's tilt toward the pointer. Pure functions (no DOM), so the clamping, the spring and the switches are unit tests.

/** The largest turn, in degrees: left-right (rotateY) and up-down (rotateX). */
export const MAX_TILT_Y = 7;
export const MAX_TILT_X = 5;
/** The spring's natural frequency (rad/s): about 0.4 s to settle. Critically damped, so it never overshoots. */
const OMEGA = 14;
/** One frame is never longer than this (a background tab must not make the spring jump). */
const MAX_DT = 0.032;
/** Under this distance and speed the spring is at rest and the animation loop stops. */
const REST = 0.02;

export type Tilt = { x: number; y: number };
export type Spring = { x: number; y: number; vx: number; vy: number };
export type Box = { left: number; top: number; width: number; height: number };

export const REST_SPRING: Spring = { x: 0, y: 0, vx: 0, vy: 0 };

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * Where the card should turn for a pointer at (clientX, clientY): `y` is rotateY (right of centre turns the right edge away),
 * `x` is rotateX (above the centre tips the top edge toward the viewer). null when the pointer is outside the box: a pointer
 * event that reaches the card from outside its box can only have come through something larger on top of it (the widget's
 * full-screen form), and then the card should lie flat.
 */
export function tiltTarget(box: Box, clientX: number, clientY: number): Tilt | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const nx = (clientX - (box.left + box.width / 2)) / (box.width / 2);
  const ny = (clientY - (box.top + box.height / 2)) / (box.height / 2);
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;
  return { x: -clamp(ny) * MAX_TILT_X, y: clamp(nx) * MAX_TILT_Y };
}

/** One frame of a critically damped spring toward `target` (semi-implicit Euler; dt in seconds, capped). */
export function springStep(s: Spring, target: Tilt, dt: number): Spring {
  const h = Math.min(MAX_DT, Math.max(0, dt));
  const axis = (p: number, v: number, t: number): [number, number] => {
    const nv = v + (OMEGA * OMEGA * (t - p) - 2 * OMEGA * v) * h;
    return [p + nv * h, nv];
  };
  const [x, vx] = axis(s.x, s.vx, target.x);
  const [y, vy] = axis(s.y, s.vy, target.y);
  return { x, y, vx, vy };
}

export const atRest = (s: Spring, target: Tilt): boolean =>
  Math.abs(target.x - s.x) < REST && Math.abs(target.y - s.y) < REST && Math.abs(s.vx) < REST && Math.abs(s.vy) < REST;

/** The CSS transform for a spring position. */
export const tiltTransform = (s: Spring): string => `rotateX(${s.x.toFixed(3)}deg) rotateY(${s.y.toFixed(3)}deg)`;

/** The tilt exists only with a real hover pointer and when motion is welcome. */
export const tiltAllowed = (env: { reducedMotion: boolean; hoverFine: boolean }): boolean => env.hoverFine && !env.reducedMotion;
