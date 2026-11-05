// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gallery, type GalleryElement } from "@/components/Gallery";
import { galleryProps, type GallerySlide } from "@/components/gallery-props";
import { siteFor } from "./helpers";

// The gallery's spot markers: a frosted disc with a ring and a dot at rest, a "+" and the title on hover and focus, a filled "×" when open; a pulse that is staggered and off for
// reduced motion. The DOM carries the states (aria-expanded, the mark, the tip); the look is in the stylesheet, which these tests read.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const base = galleryProps(siteFor("fixture-car"));
const slides: GallerySlide[] = base.slides.map((s) =>
  s.id === "cabin"
    ? {
        ...s,
        spots: [
          { id: "seats", aliases: [], x: 0.3, y: 0.5, label: "Seats", facts: [], text: "Seven seats" },
          { id: "roof", aliases: [], x: 0.5, y: 0.1, label: "Roof", facts: [], text: "Panoramic glass roof" },
          { id: "left", aliases: [], x: 0.05, y: 0.6, label: "Left edge", facts: [], text: "x" },
          { id: "right", aliases: [], x: 0.95, y: 0.6, label: "Right edge", facts: [], text: "x" },
        ],
      }
    : s,
);
const props = { ...base, slides };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  window.location.hash = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Gallery {...props} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const marker = (id: string) => container.querySelector<HTMLButtonElement>(`[data-spot='${id}']`)!;
const section = () => container.querySelector("#gallery") as GalleryElement;
const css = fs.readFileSync("src/app/globals.css", "utf8");
/** The stylesheet from the markers' first rule to the spot card's, where the look of the markers lives. */
const markerCss = css.slice(css.indexOf(".gallery__spot::before {"), css.indexOf("/* the card: on a wide screen"));
/** The declarations of every rule that ends in this selector (a selector shared by a group counts too), joined. */
const block = (selector: string) =>
  [...markerCss.matchAll(new RegExp(`${selector.replace(/[.[\]()*+?^$|\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");

describe("the marker's DOM", () => {
  it("rest: a button with the same name as before, a mark and a tooltip that are hidden from the accessibility tree, the title from content", () => {
    const m = marker("seats");
    expect(m.getAttribute("aria-label")).toBe("Show: Seats");
    expect(m.getAttribute("aria-expanded")).toBe("false");
    expect(m.querySelector(".gallery__spot-mark")?.getAttribute("aria-hidden")).toBe("true");
    const tip = m.querySelector(".gallery__spot-tip")!;
    expect(tip.textContent).toBe("Seats");
    expect(tip.getAttribute("aria-hidden")).toBe("true");
  });

  it("the position is the one it was: left and top in percent on the button, and each marker has its own pulse delay", () => {
    const delays = ["seats", "roof", "left", "right"].map((id) => marker(id).style.getPropertyValue("--spot-delay"));
    expect(new Set(delays).size).toBe(4); // never all at once
    expect(delays[0]).toBe("0.0s");
    expect(marker("seats").style.left).toMatch(/%$/);
    expect(marker("seats").style.top).toMatch(/%$/);
  });

  it("near an edge the tooltip opens towards the middle (data-edge) and under a marker near the top (data-low)", () => {
    expect(marker("left").getAttribute("data-edge")).toBe("start");
    expect(marker("right").getAttribute("data-edge")).toBe("end");
    expect(marker("seats").hasAttribute("data-edge")).toBe(false);
    expect(marker("roof").hasAttribute("data-low")).toBe(true);
    expect(marker("seats").hasAttribute("data-low")).toBe(false);
  });

  it("open: aria-expanded on that marker only; opening another closes the first; the same marker again closes it", () => {
    act(() => section().goToPhoto(2));
    act(() => void marker("seats").click());
    expect(marker("seats").getAttribute("aria-expanded")).toBe("true");
    expect(marker("roof").getAttribute("aria-expanded")).toBe("false");
    act(() => void marker("roof").click());
    expect(marker("seats").getAttribute("aria-expanded")).toBe("false");
    expect(marker("roof").getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-spot][aria-expanded=true]")).toHaveLength(1);
    act(() => void marker("roof").click());
    expect(container.querySelectorAll("[data-spot][aria-expanded=true]")).toHaveLength(0);
  });
});

describe("the look of each state (stylesheet)", () => {
  it("rest: a frosted disc (translucent fill, blur, solid fallback), a ring in the accent, a soft shadow; a 44 px hit area; theme tokens only", () => {
    const disc = block(".gallery__spot::before");
    expect(disc).toMatch(/backdrop-filter:\s*blur/);
    expect(disc).toMatch(/background:\s*color-mix\(in srgb, var\(--bg\)/);
    expect(disc).toMatch(/border:\s*2px solid var\(--accent\)/);
    expect(disc).toMatch(/box-shadow/);
    expect(markerCss).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\)[^{]*\{\s*\.gallery__spot::before\s*\{\s*background:\s*color-mix\(in srgb, var\(--bg\) 88%/);
    expect(css).toMatch(/\.gallery__spot \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    expect(markerCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i); // theme tokens only
    expect(markerCss).toMatch(/\.gallery__spot-mark::before,\s*\.gallery__spot-mark::after\s*\{[^}]*width:\s*0\.3rem;[^}]*height:\s*0\.3rem;[^}]*border-radius:\s*50%/); // the centre is a dot at rest
  });

  it("hover and focus: it grows, the centre becomes a '+', the title shows, a focus ring is drawn", () => {
    expect(markerCss).toMatch(/\.gallery__spot:focus-visible::before\s*\{\s*outline:\s*3px solid var\(--accent-line, var\(--accent\)\)/);
    expect(markerCss).toMatch(/\.gallery__spot:focus-visible::before,\s*\.gallery__spot\[aria-expanded="true"\]::before\s*\{\s*transform:\s*scale\(1\.12\)/);
    expect(markerCss).toMatch(/\.gallery__spot:focus-visible \.gallery__spot-mark::before,[^{]*\{[^}]*width:\s*0\.8rem;[^}]*height:\s*2px/);
    expect(markerCss).toMatch(/@media \(hover: hover\)\s*\{\s*\.gallery__spot:hover::before\s*\{\s*transform:\s*scale\(1\.12\)/);
    expect(markerCss).toMatch(/\.gallery__spot:hover:not\(\[aria-expanded="true"\]\) \.gallery__spot-tip\s*\{\s*opacity:\s*1/);
    expect(markerCss).toMatch(/\.gallery__spot:focus-visible:not\(\[aria-expanded="true"\]\) \.gallery__spot-tip\s*\{\s*opacity:\s*1/);
    expect(block(".gallery__spot-tip")).toMatch(/opacity:\s*0/); // hidden at rest
  });

  it("open: filled in the accent, the centre turned into a '×' in the accent's contrast colour, no tooltip, no pulse", () => {
    expect(block('.gallery__spot[aria-expanded="true"]::before')).toMatch(/background:\s*var\(--accent\)/);
    expect(block('.gallery__spot[aria-expanded="true"] .gallery__spot-mark')).toMatch(/rotate\(45deg\)/);
    expect(markerCss).toMatch(/\.gallery__spot\[aria-expanded="true"\] \.gallery__spot-mark::after\s*\{\s*background:\s*var\(--accent-contrast\)/);
    expect(markerCss).toMatch(/\.gallery__spot\[aria-expanded="true"\]::after\s*\{\s*animation:\s*none/);
    expect(markerCss).toContain(':not([aria-expanded="true"]) .gallery__spot-tip'); // the card names the spot while it is open
  });
});

describe("attention and reduced motion", () => {
  it("a ring pulses every few seconds, at the marker's own delay", () => {
    const ring = block(".gallery__spot::after");
    expect(ring).toMatch(/animation:\s*spot-pulse 7s ease-out var\(--spot-delay, 0s\) infinite/);
    expect(markerCss).toMatch(/@keyframes spot-pulse/);
  });

  it("with prefers-reduced-motion the pulse and every transition of the marker are off", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(markerCss)?.[1] ?? "";
    expect(reduced).toMatch(/\.gallery__spot::after\s*\{\s*animation:\s*none/);
    for (const part of [".gallery__spot::before", ".gallery__spot-mark", ".gallery__spot-tip"]) expect(reduced).toContain(part);
    expect(reduced).toMatch(/transition:\s*none/);
  });
});

