import { describe, expect, it } from "vitest";
import { footerLift, FOOTER_GAP } from "@/components/use-card-footer-cap";
import { footerVersionLine } from "@/components/Footer";

describe("the docked card stops above the footer", () => {
  it("does not lift while the footer is below the card's top plus the gap", () => {
    expect(footerLift({ viewportHeight: 900, footerTop: 1500, base: 96 })).toBe(0);
  });
  it("lifts by what the footer's top edge pushes in", () => {
    // card top at 900-96=804; footer top at 700 -> the card's bottom edge must sit gap above it
    expect(footerLift({ viewportHeight: 900, footerTop: 700, base: 96 })).toBe(900 - 96 - (700 - FOOTER_GAP));
  });
  it("keeps the gap between 24 and 48 px", () => {
    expect(FOOTER_GAP).toBeGreaterThanOrEqual(24);
    expect(FOOTER_GAP).toBeLessThanOrEqual(48);
  });
});

describe("the version line", () => {
  const info = { version: "0.9.0", template: "abc1234", content: "def5678", built: "2026-11-04 10:00" };
  it("is the full line in a demo and in development", () => {
    expect(footerVersionLine(info, false)).toContain("template abc1234");
  });
  it("is the version only in a release", () => {
    expect(footerVersionLine(info, true)).toBe("v0.9.0");
  });
});
