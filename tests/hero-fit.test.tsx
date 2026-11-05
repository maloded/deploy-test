// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitFacts, fitLine } from "@/lib/fact-fit";
import { fontPreloads } from "@/lib/font-preload";
import { heroFit, heroFitScript } from "@/lib/hero-fit";

const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the hero's measured fits run before the first paint (one function, inlined)", () => {
  it("the inline script holds only what the page has: no facts, no card, no selectors", async () => {
    const bare = heroFitScript({});
    expect(bare).not.toContain("hero__facts");
    expect(bare).not.toContain("agent");
    const full = heroFitScript({ facts: ".hero__facts", heading: ".sofia-intro__heading", slot: "[data-agent-slot]" });
    expect(full).toContain('"facts":".hero__facts"');
    expect(full).toContain('"slot":"[data-agent-slot]"');
    expect(() => new Function(full)).not.toThrow(); // valid script text
    expect(full).toContain('document.documentElement.removeAttribute("data-hero-pending")');
    // run for real: the pending mark is gone after the fonts promise settles, and nothing throws
    document.documentElement.setAttribute("data-hero-pending", "");
    document.body.innerHTML = '<section id="hero"></section>';
    const fonts = { ready: Promise.resolve() };
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    new Function(bare)();
    await fonts.ready;
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-hero-pending")).toBe(false); // it ends the hidden state
    expect(full).toContain("document.fonts.ready"); // after the fonts in use have arrived
  });

  describe("the same numbers as fact-fit.ts", () => {
    let hero: HTMLElement;
    const widths = new WeakMap<Node, number>();
    beforeEach(() => {
      document.documentElement.removeAttribute("style");
      delete document.documentElement.dataset.factRow;
      document.body.innerHTML = `
        <section id="hero"><div class="hero__facts"></div><div class="hero__aside"><p class="sofia-intro__heading">Hallo</p><div data-agent-slot></div></div></section>`;
      hero = document.getElementById("hero")!;
      const origRange = document.createRange.bind(document);
      vi.spyOn(document, "createRange").mockImplementation(() => {
        const r = origRange();
        let node: Node | null = null;
        (r as any).selectNodeContents = (n: Node) => (node = n);
        (r as any).getBoundingClientRect = () => ({ width: (node && widths.get(node)) ?? 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 });
        return r;
      });
      vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: true }) as any);
    });
    afterEach(() => vi.restoreAllMocks());
    const size = (el: Element, width: number) => Object.defineProperty(el, "clientWidth", { value: width, configurable: true });

    it("the facts: the scale and the wrap are fitFacts's, whatever the widths", () => {
      const row = hero.querySelector<HTMLElement>(".hero__facts")!;
      for (const [values, labels, avail] of [
        [[120, 200, 90, 140], [80, 90, 60, 70], 715],
        [[200, 260, 140, 190], [80, 90, 60, 70], 715],
        [[300, 320, 200, 260], [80, 90, 60, 70], 715],
        [[100, 100, 100], [50, 50, 50], 900],
      ] as const) {
        row.innerHTML = values.map(() => `<div class="hero__fact"><span class="hero__fact-value">v</span><span class="hero__fact-label">l</span></div>`).join("");
        row.style.columnGap = "20px";
        size(row, avail);
        [...row.querySelectorAll(".hero__fact")].forEach((f, i) => {
          widths.set(f.querySelector(".hero__fact-value")!, values[i]);
          const label = f.querySelector<HTMLElement>(".hero__fact-label")!;
          label.getBoundingClientRect = () => ({ width: labels[i] }) as DOMRect;
        });
        heroFit(hero, { facts: ".hero__facts" });
        const want = fitFacts(values.map((v, i) => ({ value: v, label: labels[i] })), avail, 20);
        expect(Number(document.documentElement.style.getPropertyValue("--fact-scale"))).toBeCloseTo(want.scale, 3);
        expect(document.documentElement.dataset.factRow).toBe(want.wrap ? "wrap" : "one");
      }
    });

    it("the invitation's heading: the scale is fitLine's", () => {
      const h = hero.querySelector<HTMLElement>(".sofia-intro__heading")!;
      for (const [natural, avail] of [[300, 400], [500, 400], [900, 400], [388, 400]]) {
        widths.set(h, natural);
        size(h, avail);
        heroFit(hero, { heading: ".sofia-intro__heading" });
        expect(Number(document.documentElement.style.getPropertyValue("--intro-scale"))).toBeCloseTo(fitLine(natural, avail), 3);
      }
    });

    it("the card's column: the row's height goes to --hero-slot-h", () => {
      const aside = hero.querySelector<HTMLElement>(".hero__aside")!;
      aside.getBoundingClientRect = () => ({ height: 451.5 }) as DOMRect;
      heroFit(hero, { slot: "[data-agent-slot]" });
      expect(document.documentElement.style.getPropertyValue("--hero-slot-h")).toBe("451.5px");
    });

    it("never touches an attribute of the hero's own elements (React hydrates them): the results are on <html>", () => {
      const row = hero.querySelector<HTMLElement>(".hero__facts")!;
      row.innerHTML = `<div class="hero__fact"><span class="hero__fact-value">v</span><span class="hero__fact-label">l</span></div>`;
      size(row, 715);
      size(hero.querySelector(".sofia-intro__heading")!, 400);
      hero.querySelector<HTMLElement>(".hero__aside")!.getBoundingClientRect = () => ({ height: 400 }) as DOMRect;
      const before = hero.outerHTML;
      heroFit(hero, { facts: ".hero__facts", heading: ".sofia-intro__heading", slot: "[data-agent-slot]" });
      expect(hero.outerHTML).toBe(before); // not one attribute changed, none added (not even an empty style)
    });

    it("leaves a part the page does not have alone, and a missing hero does nothing", () => {
      heroFit(hero, {});
      expect(document.documentElement.style.getPropertyValue("--fact-scale")).toBe("");
      expect(() => heroFit(null, { facts: ".x" })).not.toThrow();
    });
  });
});

describe("the hero is hidden (visibility, its room kept) until the fits are done, 150 ms at most", () => {
  it("has the pending state with a failsafe that shows it", () => {
    expect(css).toMatch(/html\[data-hero-pending\] \.hero \{\s*visibility: hidden;\s*animation: hero-fit-failsafe 1ms linear 150ms forwards;/);
    expect(css).toMatch(/@keyframes hero-fit-failsafe \{\s*to \{\s*visibility: visible;/);
  });
  it("the card's column has a CSS estimate before any script (100svh less the zones above and below), the measured height replaces it", () => {
    expect(css).toMatch(/var\(--hero-slot-h, calc\(100svh - 24\.8rem\)\)/);
  });
});

describe("fonts: preloaded with the stylesheet, with metric-matched stand-ins", () => {
  it("preloads the theme's heading and body fonts in the subsets of the page's language", () => {
    const de = fontPreloads("light-editorial", "de");
    expect(de).toEqual([
      "/fonts/light-editorial/source-serif-4-latin-300-normal.woff2",
      "/fonts/light-editorial/source-sans-3-latin-400-normal.woff2",
      "/fonts/light-editorial/source-sans-3-latin-600-normal.woff2",
    ]);
    expect(fontPreloads("light-editorial", "tr").some((u) => u.includes("latin-ext"))).toBe(true);
    expect(fontPreloads("light-editorial", "de").some((u) => u.includes("latin-ext"))).toBe(false);
    const bg = fontPreloads("dark-premium", "bg");
    expect(bg.some((u) => u.includes("cyrillic"))).toBe(true);
    expect(bg.every((u) => u.startsWith("/fonts/dark-premium/"))).toBe(true);
    expect(fontPreloads("no-such-theme", "de")).toEqual([]);
  });

  it("every theme font has a stand-in with the same average width and line box, ahead of the generic fallbacks", () => {
    for (const theme of ["light-editorial", "dark-premium"]) {
      const text = fs.readFileSync(path.join(process.cwd(), "public", "themes", `${theme}.css`), "utf8");
      for (const v of ["--font-heading", "--font-body"]) {
        const m = new RegExp(`${v}:\\s*"([^"]+)",\\s*"([^"]+) Fallback"`).exec(text);
        expect(m, `${theme} ${v}`).not.toBeNull();
        expect(m![2]).toBe(m![1]);
        const face = new RegExp(`@font-face\\s*\\{[^}]*"${m![1]} Fallback"[^}]*\\}`).exec(text)?.[0] ?? "";
        expect(face).toMatch(/size-adjust:\s*\d+(\.\d+)?%/);
        expect(face).toMatch(/ascent-override:/);
        expect(face).toMatch(/descent-override:/);
        expect(face).toMatch(/src:\s*local\(/);
      }
    }
  });
});
