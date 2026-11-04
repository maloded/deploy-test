import { describe, expect, it } from "vitest";
import { ratioNumber } from "@/components/ProductLayout";

describe("the gallery ratio as a number (for the stage's width cap)", () => {
  it("is width over height of the ratios the product types use", () => {
    expect(ratioNumber("3 / 2")).toBe(1.5);
    expect(ratioNumber("16 / 9")).toBe(1.778);
    expect(ratioNumber("4 / 5")).toBe(0.8);
    expect(ratioNumber("1 / 1")).toBe(1);
  });
  it("is 1.5 for anything that is not a / b", () => {
    for (const bad of ["", "wide", "3", "3 / 0", "a / b"]) expect(ratioNumber(bad), bad).toBe(1.5);
  });
});
