// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FACT_MIN_SCALE, factRowWidth, fitFacts } from "@/lib/fact-fit";

// the measured needs of the Bulgarian facts in the light theme at 1440 px (value width, label's narrowest width), 715 px of room, 36 px between the facts
const BG = [
  { value: 93, label: 116 },
  { value: 216, label: 74 },
  { value: 95, label: 90 },
  { value: 219, label: 101 },
];

describe("fitting the key facts into one row", () => {
  it("keeps the full size when the row fits", () => {
    expect(fitFacts(BG, 900, 36)).toEqual({ scale: 1, wrap: false });
    expect(fitFacts([], 100, 36)).toEqual({ scale: 1, wrap: false });
  });

  it("scales the values down, as little as possible, until the row fits", () => {
    const r = fitFacts(BG, 715, 36);
    expect(r.wrap).toBe(false);
    expect(r.scale).toBeLessThan(1);
    expect(r.scale).toBeGreaterThanOrEqual(FACT_MIN_SCALE);
    expect(factRowWidth(BG, r.scale, 36)).toBeLessThanOrEqual(715);
    expect(factRowWidth(BG, r.scale + 0.01, 36)).toBeGreaterThan(715 - 4); // the largest scale that fits (to within a hair)
  });

  it("stops at the minimum and lets the values wrap inside their tiles when even that does not fit, never a second row", () => {
    expect(fitFacts(BG, 520, 36)).toEqual({ scale: FACT_MIN_SCALE, wrap: true });
  });

  it("the smallest scale keeps a value at 1rem or more (the base 1.25rem times the minimum)", () => {
    expect(1.25 * FACT_MIN_SCALE).toBeGreaterThanOrEqual(1);
  });

  it("a long label sets the floor of its tile, the value cannot shrink below it", () => {
    const needs = [{ value: 100, label: 160 }, { value: 100, label: 160 }];
    expect(fitFacts(needs, 340, 20)).toEqual({ scale: 1, wrap: false }); // 160 + 160 + 20: fits at full size
    expect(fitFacts(needs, 300, 20)).toEqual({ scale: FACT_MIN_SCALE, wrap: true }); // labels alone need 340
  });
});

import { fitLine } from "@/lib/fact-fit";

describe("fitting the invitation heading into one line", () => {
  it("keeps its size when it fits, shrinks to fit, and stops at the limit (the CSS then ends it with an ellipsis)", () => {
    expect(fitLine(200, 300)).toBe(1);
    expect(fitLine(290, 300)).toBe(1); // within the margin (97% of the room)
    expect(fitLine(300, 300)).toBeLessThan(1); // exactly as wide as the box: a hair smaller, so it does not end in an ellipsis
    expect(fitLine(300, 240)).toBeCloseTo(0.776, 2);
    expect(fitLine(400, 200)).toBe(0.75);
    expect(fitLine(0, 200)).toBe(1); // nothing measured (no layout): leave it alone
  });
});
