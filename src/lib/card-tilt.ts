// The avatar card's hover tilt, ported from the Hanc role hero (src/components/v3/role/RoleHero.astro, "Pointer tilt with a spring").
// Pure functions (no DOM), so the clamping, the spring and the switches are unit tests.
//
// Hanc's constants are kept: the pointer is read against the stage box and clamped to -1..1 on each axis, the card turns at most 6 degrees
// (rotateX = -y x 6, rotateY = x x 6) inside perspective(1400px), the light layer (glint) slides by 22% of its box with the same position, and
// the spring is  v = (v + (target - x) x 0.08) x 0.78;  x += v  once per frame. THE ONE DEVIATION: Hanc runs that update once per
// animation frame, so it is twice as fast on a 120 Hz screen. Here the step is scaled by the real frame time (dt x 60): at 60 Hz it is
// exactly Hanc's update, at 120 Hz it is two half steps, so the card feels the same everywhere.

/** The largest turn on each axis, in degrees (Hanc: MAX = 6). */
export const MAX_TILT = 6;
/** Spring stiffness and damping per 60 Hz frame (Hanc: k = 0.08, d = 0.78). */
export const STIFFNESS = 0.08;
export const DAMPING = 0.78;
/** The frame time the constants belong to, and the longest frame that is simulated (a background tab must not make the card jump). */
export const FRAME = 1 / 60;
const MAX_FRAMES = 2;
/** Under this distance and speed (in the -1..1 units of the target) the spring is at rest and the animation loop stops (Hanc: 0.001). */
const REST = 0.001;
/** The light layer slides by this share of its box per unit of position (Hanc: 22%). */
export const GLINT_SHIFT = 22;
/** The perspective of the frame, also at rest (Hanc: 1400px). */
export const TILT_PERSPECTIVE = "1400px";

/** A position or target on both axes: -1 (left, top) to 1 (right, bottom). */
export type Tilt = { x: number; y: number };
export type Spring = { x: number; y: number; vx: number; vy: number };
export type Box = { left: number; top: number; width: number; height: number };

export const REST_SPRING: Spring = { x: 0, y: 0, vx: 0, vy: 0 };

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * Where the card should turn for a pointer at (clientX, clientY): -1 to 1 on each axis, 0 in the centre. null when the pointer is outside
 * the box: a pointer event that reaches the card from outside its box can only have come through something larger on top of it (the
 * widget's full-screen form), and then the card should lie flat. (Hanc has no such rule: its call widget has no overlay.)
 */
export function tiltTarget(box: Box, clientX: number, clientY: number): Tilt | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const x = (clientX - (box.left + box.width / 2)) / (box.width / 2);
  const y = (clientY - (box.top + box.height / 2)) / (box.height / 2);
  if (Math.abs(x) > 1 || Math.abs(y) > 1) return null;
  return { x: clamp(x), y: clamp(y) };
}

/** One step of the spring over `dt` seconds. At dt = 1/60 it is Hanc's per-frame update; a longer or shorter frame scales it. */
export function springStep(s: Spring, target: Tilt, dt: number): Spring {
  const f = Math.min(MAX_FRAMES, Math.max(0, dt / FRAME));
  const damping = Math.pow(DAMPING, f);
  const vx = (s.vx + (target.x - s.x) * STIFFNESS * f) * damping;
  const vy = (s.vy + (target.y - s.y) * STIFFNESS * f) * damping;
  return { x: s.x + vx * f, y: s.y + vy * f, vx, vy };
}

export const atRest = (s: Spring, target: Tilt): boolean =>
  Math.abs(target.x - s.x) < REST && Math.abs(target.y - s.y) < REST && Math.abs(s.vx) < REST && Math.abs(s.vy) < REST;

/** The frame's transform when it is not turned: the perspective alone (the depth of the caption layers needs it). */
export const REST_TRANSFORM = `perspective(${TILT_PERSPECTIVE})`;

/** A number as the CSS gets it: no "-0.0" for a value that rounds to zero. */
const fixed = (v: number, digits: number): string => (Math.abs(v) < 0.5 / 10 ** digits ? 0 : v).toFixed(digits);

/** The CSS transform for a spring position: the perspective is inside it, so no ancestor needs a perspective property. */
export const tiltTransform = (s: Spring): string => `perspective(${TILT_PERSPECTIVE}) rotateX(${fixed(-s.y * MAX_TILT, 3)}deg) rotateY(${fixed(s.x * MAX_TILT, 3)}deg)`;

/** The light layer's transform for a spring position. */
export const glintTransform = (s: Spring): string => `translate(${fixed(s.x * GLINT_SHIFT, 1)}%, ${fixed(s.y * GLINT_SHIFT, 1)}%)`;

/** The tilt exists only with a real hover pointer and when motion is welcome. */
export const tiltAllowed = (env: { reducedMotion: boolean; hoverFine: boolean }): boolean => env.hoverFine && !env.reducedMotion;
