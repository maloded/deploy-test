// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_TILT, REST_SPRING, REST_TRANSFORM, atRest, glintTransform, springStep, tiltAllowed, tiltTarget, tiltTransform } from "../src/lib/card-tilt";

const box = { left: 100, top: 200, width: 200, height: 250 }; // centre (200, 325)

describe("tiltTarget (the pointer against the card's box, -1 to 1)", () => {
  it("is flat in the centre", () => {
    const t = tiltTarget(box, 200, 325)!;
    expect(Math.abs(t.x)).toBe(0);
    expect(Math.abs(t.y)).toBe(0);
  });
  it("is -1 / 1 at the edges and scales between", () => {
    expect(tiltTarget(box, 300, 325)).toEqual({ x: 1, y: 0 });
    expect(tiltTarget(box, 100, 450)).toEqual({ x: -1, y: 1 });
    expect(tiltTarget(box, 250, 325)!.x).toBeCloseTo(0.5);
  });
  it("is null outside the box (an event that came through the widget's full-screen form) and for an empty box", () => {
    expect(tiltTarget(box, 301, 325)).toBeNull();
    expect(tiltTarget(box, 200, 10)).toBeNull();
    expect(tiltTarget({ ...box, width: 0 }, 200, 325)).toBeNull();
  });
});

describe("the transforms (Hanc: 6 degrees, perspective 1400px, glint 22%)", () => {
  it("turns at most 6 degrees on each axis; up tips the top edge toward the viewer, right turns the right edge away", () => {
    expect(MAX_TILT).toBe(6);
    expect(tiltTransform({ x: 1, y: 0, vx: 0, vy: 0 })).toBe("perspective(1400px) rotateX(0.000deg) rotateY(6.000deg)");
    expect(tiltTransform({ x: 0, y: -1, vx: 0, vy: 0 })).toBe("perspective(1400px) rotateX(6.000deg) rotateY(0.000deg)");
    expect(tiltTransform({ x: -1, y: 1, vx: 0, vy: 0 })).toBe("perspective(1400px) rotateX(-6.000deg) rotateY(-6.000deg)");
  });
  it("at rest the frame keeps the perspective alone", () => {
    expect(REST_TRANSFORM).toBe("perspective(1400px)");
  });
  it("slides the light layer by 22% per unit", () => {
    expect(glintTransform({ x: 1, y: -0.5, vx: 0, vy: 0 })).toBe("translate(22.0%, -11.0%)");
  });
});

describe("springStep (Hanc's per-frame spring, scaled by the real frame time)", () => {
  /** Hanc's update, as written in RoleHero.astro: one step per animation frame. */
  const hanc = (s: { x: number; vx: number }, t: number) => {
    const vx = (s.vx + (t - s.x) * 0.08) * 0.78;
    return { x: s.x + vx, vx };
  };
  it("is exactly Hanc's update at 60 Hz", () => {
    let a = { x: 0, vx: 0 };
    let b = { ...REST_SPRING };
    for (let i = 0; i < 40; i++) {
      a = hanc(a, 1);
      b = springStep(b, { x: 1, y: 0 }, 1 / 60);
      expect(b.x).toBeCloseTo(a.x, 10);
      expect(b.vx).toBeCloseTo(a.vx, 10);
    }
  });
  it("feels the same at 120 Hz and 30 Hz: the position after the same time differs by under 0.03", () => {
    const at = (hz: number, seconds: number) => {
      let s = { ...REST_SPRING };
      for (let i = 0; i < Math.round(hz * seconds); i++) s = springStep(s, { x: 1, y: 0 }, 1 / hz);
      return s.x;
    };
    for (const seconds of [0.1, 0.2, 0.4]) {
      expect(Math.abs(at(120, seconds) - at(60, seconds))).toBeLessThan(0.03);
      expect(Math.abs(at(30, seconds) - at(60, seconds))).toBeLessThan(0.03);
    }
  });
  it("reaches the target and then rests; returns to flat from a tilted position", () => {
    let s = { x: 0.7, y: -0.9, vx: 0, vy: 0 };
    for (let i = 0; i < 600 && !atRest(s, { x: 0, y: 0 }); i++) s = springStep(s, { x: 0, y: 0 }, 1 / 60);
    expect(atRest(s, { x: 0, y: 0 })).toBe(true);
  });
  it("caps a long frame (two 60 Hz frames), so a pause does not make it jump", () => {
    const jump = springStep(REST_SPRING, { x: 1, y: 0 }, 10);
    expect(springStep(REST_SPRING, { x: 1, y: 0 }, 2 / 60)).toEqual(jump);
    expect(springStep(REST_SPRING, { x: 1, y: 0 }, -1)).toEqual(REST_SPRING);
  });
});

describe("tiltAllowed", () => {
  it("needs a hovering fine pointer and no reduced motion", () => {
    expect(tiltAllowed({ reducedMotion: false, hoverFine: true })).toBe(true);
    expect(tiltAllowed({ reducedMotion: true, hoverFine: true })).toBe(false);
    expect(tiltAllowed({ reducedMotion: false, hoverFine: false })).toBe(false);
  });
});
