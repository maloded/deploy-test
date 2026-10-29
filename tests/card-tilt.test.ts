// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_TILT_X, MAX_TILT_Y, REST_SPRING, atRest, springStep, tiltAllowed, tiltTarget, tiltTransform } from "../src/lib/card-tilt";

const box = { left: 100, top: 200, width: 200, height: 250 }; // centre (200, 325)

describe("tiltTarget", () => {
  it("is flat in the centre", () => {
    const t = tiltTarget(box, 200, 325)!;
    expect(Math.abs(t.x)).toBe(0);
    expect(Math.abs(t.y)).toBe(0);
  });
  it("turns toward the pointer, at most 7deg left-right and 5deg up-down, at the edges", () => {
    expect(tiltTarget(box, 300, 325)).toEqual({ x: -0, y: MAX_TILT_Y });
    expect(tiltTarget(box, 100, 325)!.y).toBe(-MAX_TILT_Y);
    expect(tiltTarget(box, 200, 200)!.x).toBe(MAX_TILT_X); // top edge toward the viewer
    expect(tiltTarget(box, 200, 450)!.x).toBe(-MAX_TILT_X);
  });
  it("scales between the centre and the edge", () => {
    expect(tiltTarget(box, 250, 325)!.y).toBeCloseTo(MAX_TILT_Y / 2);
  });
  it("is null outside the box (an event that came through the widget's full-screen form) and for an empty box", () => {
    expect(tiltTarget(box, 301, 325)).toBeNull();
    expect(tiltTarget(box, 200, 10)).toBeNull();
    expect(tiltTarget({ ...box, width: 0 }, 200, 325)).toBeNull();
  });
});

describe("springStep", () => {
  const settle = (from: typeof REST_SPRING, target: { x: number; y: number }) => {
    let s = from;
    let peak = 0;
    for (let i = 0; i < 600 && !atRest(s, target); i++) {
      s = springStep(s, target, 0.016);
      peak = Math.max(peak, Math.abs(s.y));
    }
    return { s, peak };
  };
  it("reaches the target without overshooting (critically damped) and then rests", () => {
    const { s, peak } = settle(REST_SPRING, { x: 0, y: 7 });
    expect(atRest(s, { x: 0, y: 7 })).toBe(true);
    expect(peak).toBeLessThanOrEqual(7.01);
  });
  it("returns to flat from a tilted position", () => {
    const { s } = settle({ x: 3, y: -7, vx: 0, vy: 0 }, { x: 0, y: 0 });
    expect(atRest(s, { x: 0, y: 0 })).toBe(true);
    expect(tiltTransform({ ...s, x: 0, y: 0 })).toBe("rotateX(0.000deg) rotateY(0.000deg)");
  });
  it("caps a long frame, so a pause does not make it jump", () => {
    const jump = springStep(REST_SPRING, { x: 0, y: 7 }, 10);
    expect(springStep(REST_SPRING, { x: 0, y: 7 }, 0.032)).toEqual(jump);
    expect(springStep(REST_SPRING, { x: 0, y: 7 }, -1)).toEqual(REST_SPRING);
  });
});

describe("tiltAllowed", () => {
  it("needs a hovering fine pointer and no reduced motion", () => {
    expect(tiltAllowed({ reducedMotion: false, hoverFine: true })).toBe(true);
    expect(tiltAllowed({ reducedMotion: true, hoverFine: true })).toBe(false);
    expect(tiltAllowed({ reducedMotion: false, hoverFine: false })).toBe(false);
  });
});
