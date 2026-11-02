// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_VIEW, mostVisible, readPageView } from "@/lib/page-view";

describe("mostVisible", () => {
  const boxes = [
    { id: "hero", top: -700, bottom: 100 },
    { id: "gallery", top: 100, bottom: 900 },
    { id: "specs", top: 900, bottom: 1500 },
  ];
  it("is the block with the largest part in the viewport", () => {
    expect(mostVisible(boxes, 800)).toBe("gallery"); // gallery: 700, hero: 100
    expect(mostVisible(boxes.map((b) => ({ ...b, top: b.top - 600, bottom: b.bottom - 600 })), 800)).toBe("specs");
  });
  it("is null when nothing is in the viewport", () => {
    expect(mostVisible([{ id: "x", top: 900, bottom: 1200 }], 800)).toBeNull();
    expect(mostVisible([], 800)).toBeNull();
  });
  it("a tie goes to the earlier block", () => {
    expect(mostVisible([{ id: "a", top: 0, bottom: 400 }, { id: "b", top: 400, bottom: 800 }], 800)).toBe("a");
  });
});

describe("readPageView", () => {
  afterEach(() => (document.body.innerHTML = ""));
  it("without a gallery everything but the section is empty", () => {
    document.body.innerHTML = `<div data-block-order="hero faq"></div><section id="hero"></section>`;
    expect(readPageView(document)).toEqual({ ...EMPTY_VIEW, section: null });
  });
  it("reads the gallery from its own getView and the section from the boxes", () => {
    document.body.innerHTML = `<div data-block-order="hero gallery"></div><section id="hero"></section><section id="gallery"></section>`;
    const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
    document.getElementById("hero")!.getBoundingClientRect = () => rect(-900, 50);
    const g = document.getElementById("gallery") as HTMLElement & { getView?: () => unknown };
    g.getBoundingClientRect = () => rect(50, 800);
    g.getView = () => ({ category: "details", photo: "mileage", index: 13, total: 14, spot: "mileage-reading", fullscreen: false });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    expect(readPageView(document)).toEqual({ section: "gallery", category: "details", photo: "mileage", index: 13, total: 14, spot: "mileage-reading", fullscreen: false });
  });
});
