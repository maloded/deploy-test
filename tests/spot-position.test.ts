import { describe, expect, it } from "vitest";
import { parseFocus, spotPlacement } from "@/lib/spot-position";

const img = { width: 4, height: 3 };

describe("spotPlacement", () => {
  it("is the photo's own position when the ratios match, or when the stage is unknown", () => {
    expect(spotPlacement({ x: 0.2, y: 0.7 }, img, { width: 400, height: 300 })).toEqual({ left: 20, top: 70 });
    expect(spotPlacement({ x: 0.2, y: 0.7 }, img, null)).toEqual({ left: 20, top: 70 });
    expect(spotPlacement({ x: 0.2, y: 0.7 }, img, { width: 0, height: 0 })).toEqual({ left: 20, top: 70 });
  });
  it("a wider photo (cropped at the sides) is stretched around the focus", () => {
    // photo 4:3 in a 2:1 stage? that is wider than the photo: the photo's top and bottom are cropped instead
    const p = spotPlacement({ x: 0.5, y: 0.5 }, img, { width: 200, height: 100 });
    expect(p.left).toBe(50);
    expect(p.top).toBeCloseTo(50);
    // photo 2:1 in a 4:3 stage: sides cropped; the centre stays the centre, a spot at 0.25 moves outwards
    const wide = { width: 2, height: 1 };
    expect(spotPlacement({ x: 0.5, y: 0.4 }, wide, { width: 4, height: 3 })).toEqual({ left: 50, top: 40 });
    const q = spotPlacement({ x: 0.75, y: 0.4 }, wide, { width: 4, height: 3 });
    expect(q.left).toBeCloseTo(((1 - 1.5) * 0.5 + 0.75 * 1.5) * 100); // 87.5
  });
  it("the focus point decides which side is cropped", () => {
    const wide = { width: 2, height: 1 };
    const atLeft = spotPlacement({ x: 0.1, y: 0.5 }, wide, { width: 4, height: 3 }, { px: 0, py: 0.5 });
    expect(atLeft.left).toBeCloseTo(15); // focus at the left edge: left side kept, so x grows by the scale only
  });
  it("a spot cropped away is clamped to the edge", () => {
    const wide = { width: 3, height: 1 };
    expect(spotPlacement({ x: 0, y: 0.5 }, wide, { width: 1, height: 1 }).left).toBe(0);
    expect(spotPlacement({ x: 1, y: 0.5 }, wide, { width: 1, height: 1 }).left).toBe(100);
  });
  it("a portrait photo in a landscape stage is cropped at top and bottom", () => {
    const portrait = { width: 3, height: 4 };
    const p = spotPlacement({ x: 0.5, y: 0.5 }, portrait, { width: 3, height: 2 });
    expect(p.left).toBe(50);
    expect(p.top).toBeCloseTo(50);
    const edge = spotPlacement({ x: 0.5, y: 0.6 }, portrait, { width: 3, height: 2 });
    expect(edge.top).toBeGreaterThan(60);
  });
});

describe("parseFocus", () => {
  it("reads the object-position of a slide, and is centred otherwise", () => {
    expect(parseFocus("25% 75%")).toEqual({ px: 0.25, py: 0.75 });
    expect(parseFocus(undefined)).toEqual({ px: 0.5, py: 0.5 });
    expect(parseFocus("center")).toEqual({ px: 0.5, py: 0.5 });
  });
});
