// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { heroLayout } from "@/lib/hero";
import { buildSite } from "@/lib/site";
import { validateProduct } from "@/lib/validate";
import { FIXTURE_DIR, fixtures } from "./helpers";

vi.mock("hanc-webrtc-widgets", () => ({}));

const AVATAR: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: [], example: null, liveText: null, intro: null } as any;
const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };
const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function pageOf(hero?: Record<string, unknown>, card = true) {
  const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
  const product = { ...s.product, hero: { ...(s.product.hero ?? {}), ...(hero ?? {}) }, media: { ...s.product.media, heroCutout: true } };
  const site = { ...s, product, seller: { ...s.seller, agent: card ? agent : undefined } as any, avatar: card ? AVATAR : null } as any;
  return renderToStaticMarkup(<ProductLayout site={site} />);
}
const heroOf = (hero?: Record<string, unknown>, card = true) => /<section class="hero"[\s\S]*?<div class="hero__intro">/.exec(pageOf(hero, card))?.[0] ?? "";
/** Everything of the page except the hero section (and the hero photo's preload hint, which each layout makes its own way): it must not depend on the layout. */
const restOf = (hero?: Record<string, unknown>) => pageOf(hero).replace(/<link rel="preload"[^>]*>/g, "").replace(/<section class="hero"[\s\S]*?<\/section>/, "");
const PODIUM = { podium: { x: 50, y: 60, text: "VW", leds: true }, frame: { left: -30, right: 130, top: -2, bottom: 130 }, lights: [{ x: 50, y: 50, size: 10 }] };

describe("hero.layout", () => {
  it("is validated: cards or podium, anything else is refused, and the podium settings stay valid whichever it is", () => {
    const check = (hero: unknown) => {
      const p = JSON.parse(JSON.stringify(fixtures.sampleJson("fixture-car")));
      p.hero = { ...(p.hero ?? {}), ...(hero as object) };
      const r = validateProduct(p);
      return r.ok ? [] : r.issues;
    };
    expect(check({ layout: "cards" })).toEqual([]);
    expect(check({ layout: "podium" })).toEqual([]);
    expect(check({ layout: "cards", mode: "single", ...PODIUM })).toEqual([]);
    expect(check({ layout: "grid" }).length).toBeGreaterThan(0);
    expect(check({ layout: true }).length).toBeGreaterThan(0);
  });

  it("is cards when the field is missing (the original hero); the older hero.mode single still means podium; layout wins over mode", () => {
    expect(heroLayout(undefined)).toBe("cards");
    expect(heroLayout({})).toBe("cards");
    expect(heroLayout({ mode: "tiles" })).toBe("cards");
    expect(heroLayout({ mode: "single" })).toBe("podium");
    expect(heroLayout({ layout: "podium" })).toBe("podium");
    expect(heroLayout({ layout: "cards", mode: "single" })).toBe("cards");
    expect(heroLayout({ layout: "podium", mode: "tiles" })).toBe("podium");
  });
});

describe("both layouts render", () => {
  it("a hero without the field is the cards hero: the photo, two cards that open the gallery, no car, no podium", () => {
    const hero = heroOf();
    expect(hero).toContain('data-layout="cards"');
    expect(hero).toContain("hero__thumb");
    expect(hero).not.toContain("hero__car");
    expect(hero).not.toContain('data-mode="single"');
    expect(hero.match(/class="hero__thumb"/g)).toHaveLength(2);
  });

  it("cards ignores every podium setting (even with the older mode single); podium renders the car and no cards", () => {
    const cards = heroOf({ layout: "cards", mode: "single", ...PODIUM });
    expect(cards).toContain('data-layout="cards"');
    expect(cards).toContain("hero__thumb");
    for (const gone of ["hero__car", "hero__pod", "hero__led", "hero__light", "data-podium"]) expect(cards, gone).not.toContain(gone);
    const podium = heroOf({ layout: "podium", ...PODIUM });
    expect(podium).toContain('data-layout="podium"');
    expect(podium).toMatch(/<svg class="hero__car"/);
    expect(podium).toContain('data-podium="true"');
    expect(podium).not.toContain("hero__thumb");
  });

  it("both keep the headline, the invitation and the card's slot, and mark the hero for the pre-paint fit", () => {
    for (const layout of ["cards", "podium"] as const) {
      const hero = heroOf({ layout });
      expect(hero, layout).toContain("hero__headline");
      expect(hero, layout).toContain("data-agent-slot");
      const page = pageOf({ layout });
      expect(page, layout).toContain('"slot":"[data-agent-slot]"');
    }
  });

  it("the head marks the hero pending for any layout (the root layout asks only whether the page has a hero) and preloads the theme's fonts", () => {
    const layoutSrc = fs.readFileSync(path.join(process.cwd(), "src", "app", "[lang]", "layout.tsx"), "utf8");
    expect(layoutSrc).toMatch(/site\.blocks\.includes\("hero"\) && <script[^>]*data-hero-pending/);
    expect(layoutSrc).not.toMatch(/layout\s*===?\s*["']podium|heroLayout|hero\?\.(mode|layout)/);
    expect(layoutSrc).toContain("fontPreloads(theme, lang)");
  });

  it("without the agent's card there is no layout mark and no podium, whatever the field says", () => {
    const hero = heroOf({ layout: "podium", ...PODIUM }, false);
    expect(hero).not.toContain("data-layout");
    expect(hero).not.toContain("hero__car");
  });
});

describe("switching does not touch the other sections", () => {
  it("the page outside the hero is the same in both layouts", () => {
    const cards = restOf({ layout: "cards" });
    expect(cards.length).toBeGreaterThan(1000);
    expect(restOf({ layout: "podium", ...PODIUM })).toBe(cards);
    expect(restOf()).toBe(cards);
  });
});

describe("no layout shift, in both layouts", () => {
  it("the podium's larger-picture rules (headline, stage, lead-in) apply to the podium layout only", () => {
    const block = /@media \(min-width: 56em\) and \(min-height: 37\.5em\) \{\s*\.hero\[data-card\]\[data-layout="podium"\] \.hero__lead-in[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(block).toContain('.hero[data-card][data-layout="podium"] .hero__top .hero__stage');
    expect(block).toContain('.hero[data-card][data-layout="podium"] .hero__top .hero__headline');
    expect(css).not.toMatch(/\.hero\[data-card\] \.hero__top \.hero__(stage|headline)/);
  });

  it("the hidden-until-fitted state and its failsafe are not tied to a layout, and the fit script is in the page either way", () => {
    expect(css).toMatch(/html\[data-hero-pending\] \.hero \{/);
    expect(css).not.toMatch(/data-layout[^{]*\{[^}]*data-hero-pending/);
    for (const layout of ["cards", "podium"]) {
      const page = pageOf({ layout });
      expect(page.match(/data-hero-pending/g)!.length, layout).toBeGreaterThanOrEqual(1);
      expect(page.indexOf("document.fonts"), layout).toBeGreaterThan(-1);
    }
  });

  it("the layout mark is on the section itself (server-rendered), so the first paint already has the right rules and nothing is swapped after hydration", () => {
    for (const layout of ["cards", "podium"]) expect(pageOf({ layout })).toMatch(new RegExp(`<section class="hero" id="hero"[^>]*data-layout="${layout}"`));
  });
});

describe("the cards layout's headings and photo area (client feedback)", () => {
  const rule = (selector: string, from = css) => {
    const i = from.indexOf(selector + " {");
    return i < 0 ? "" : from.slice(i, from.indexOf("}", i) + 1);
  };
  const cards = '.hero[data-layout="cards"]';

  it("on a phone the eyebrow and the title are both centred; from 56em the title is left-aligned and the eyebrow centred over the photo area; the rules name the cards layout only", () => {
    expect(rule(`${cards} .hero__lead-in`)).toMatch(/text-align: center/);
    expect(rule(`${cards} .hero__lead-in`)).not.toMatch(/text-align: left/);
    const phone = /@media \(width < 56em\) \{\s*\.hero\[data-layout="cards"\] \.hero__top > \.hero__stage \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(phone).toMatch(/align-items: center/);
    expect(phone).toMatch(/text-align: center/);
    expect(phone).not.toMatch(/text-align: left/);
    // wide: the title column's own rule (left-aligned) is the layout's, and the cards block does not centre the stage there
    expect(css).toMatch(/@media \(min-width: 56em\) \{\s*\.hero__top \{[\s\S]*?\.hero__top \.hero__stage \{\s*align-items: flex-start;\s*align-self: stretch;\s*text-align: left;/);
    // no rule of the cards block can reach the podium
    for (const m of css.matchAll(/\.hero\[data-layout="(\w+)"\][^{]*\{/g)) expect(["cards", "podium"]).toContain(m[1]);
  });

  it("on a wide window the eyebrow's band leaves out the card's column (the slot's width with its floor, and the row's gap), so the centre is the photo area's; every height tier has the slot's own floor", () => {
    const lead = rule(`  ${cards} .hero__lead-in`);
    expect(lead).toMatch(/padding-right: calc\(var\(--space-4\) \+ var\(--hero-lead-slot-w, 18rem\) \+ max\(2\.5rem, min\(5vw, 5rem\)\)\)/);
    // the same width as .hero__slot's (36rem, 44vw, 0.8 of the row's height), with the floors of its three tiers: 18rem, 13rem, 11rem
    const slotW = (floor: string) => `--hero-lead-slot-w: max(${floor}, min(36rem, 44vw, calc(var(--hero-slot-h, calc(100svh - 24.8rem)) * 0.8)))`;
    expect(css).toContain(slotW("18rem"));
    expect(css).toMatch(/min-height: 50\.01em\) and \(max-height: 60em\) \{\s*\.hero\[data-layout="cards"\] \.hero__lead-in \{\s*--hero-lead-slot-w: max\(13rem,/);
    expect(css).toMatch(/max-height: 50em\) \{\s*\.hero\[data-layout="cards"\] \.hero__lead-in \{[^}]*--hero-lead-slot-w: max\(11rem,/);
    for (const [floor, tier] of [["18rem", /\.hero__slot \{\s*align-self: stretch;\s*width: min\(36rem, 44vw, calc\(var\(--hero-slot-h, calc\(100svh - 24\.8rem\)\) \* 0\.8\)\);\s*min-width: 18rem/], ["13rem", /\.hero__slot \{\s*min-width: 13rem/], ["11rem", /\.hero__slot \{\s*min-width: 11rem/]] as const) expect(css, floor).toMatch(tier); // the slot still has these floors
  });

  it("on a wide window the eyebrow sits higher, the band keeps its height (so the invitation and the card stay) and the title block is pulled up", () => {
    const lead = rule(`  ${cards} .hero__lead-in`);
    expect(lead).toMatch(/padding-block: var\(--space-3\) var\(--space-5\)/); // was space-5 above and space-3 below: the same sum
    expect(rule(`  ${cards} .hero__top .hero__stage`)).toMatch(/margin-top: -[\d.]+rem/);
    // the short-window tier swaps its own two paddings the same way (space-3 / space-2 before)
    expect(css).toMatch(/max-height: 50em\) \{\s*\.hero\[data-layout="cards"\] \.hero__lead-in \{\s*padding-block: var\(--space-2\) var\(--space-3\)/);
  });

  it("the title is the theme's headline size times --hero-title-scale (0.78 by default, about 22% smaller), at every width", () => {
    const h = rule(`${cards} .hero__headline`);
    expect(h).toMatch(/font-size: calc\(var\(--hero-headline-size, clamp\(1\.9rem, 4vw, 3\.25rem\)\) \* var\(--hero-title-scale, 0\.78\)\)/);
    expect(h).not.toMatch(/@media/); // not tied to a width: phone and tablet shrink in proportion
  });

  it("the photo area is two columns in the ratio --hero-main-fr : --hero-side-fr (2fr : 1fr by default); the main card fills its column, the stack of cards is as tall as it", () => {
    const grid = rule(`  ${cards} .hero__top .hero__photo[data-thumbs]`);
    expect(grid).toMatch(/grid-template-columns: minmax\(0, var\(--hero-main-fr, 2fr\)\) minmax\(0, var\(--hero-side-fr, 1fr\)\)/);
    const frame = rule(`  ${cards} .hero__top .hero__photo[data-thumbs] .hero__frame`);
    expect(frame).toMatch(/width: 100%/);
    expect(frame).toMatch(/aspect-ratio: auto/);
    expect(frame).toMatch(/align-self: stretch/);
    const box = rule(`  ${cards} .hero__top .hero__photo[data-thumbs] .hero__box`);
    expect(box).toMatch(/position: absolute/);
    expect(box).toMatch(/inset: 0/);
    // the cards' own gaps and radii are untouched
    expect(css).toMatch(/\.hero\[data-card\] \.hero__thumb \{\s*border-radius: var\(--radius-media, var\(--radius\)\)/);
    expect(css).toMatch(/\.hero__thumbs \{\s*display: flex;\s*flex-direction: column;\s*gap: var\(--space-2\)/);
  });

  it("hero.titleScale and hero.mainShare are optional, validated, and reach the CSS as variables only when set (cards only)", () => {
    const check = (hero: unknown) => {
      const p = JSON.parse(JSON.stringify(fixtures.sampleJson("fixture-car")));
      p.hero = { ...(p.hero ?? {}), ...(hero as object) };
      const r = validateProduct(p);
      return r.ok ? [] : r.issues;
    };
    expect(check({ titleScale: 0.7, mainShare: 0.7 })).toEqual([]);
    for (const bad of [{ titleScale: 0.2 }, { titleScale: 1.5 }, { mainShare: 0.3 }, { mainShare: 0.95 }, { mainShare: "wide" }]) expect(check(bad).length, JSON.stringify(bad)).toBeGreaterThan(0);
    expect(heroOf()).not.toContain("--hero-title-scale");
    expect(heroOf()).not.toContain("--hero-main-fr");
    const set = heroOf({ titleScale: 0.7, mainShare: 0.7 });
    expect(set).toContain("--hero-title-scale:0.7");
    expect(set).toContain("--hero-main-fr:0.7fr");
    expect(set).toContain("--hero-side-fr:0.3fr");
    expect(heroOf({ layout: "podium", titleScale: 0.7, mainShare: 0.7, ...PODIUM })).not.toContain("--hero-title-scale"); // the podium ignores them
  });

  it("the thumbnails are still two links to the gallery, and the page outside the hero does not change with the settings", () => {
    expect(heroOf({ mainShare: 0.7 }).match(/class="hero__thumb"/g)).toHaveLength(2);
    expect(restOf({ titleScale: 0.6, mainShare: 0.6 })).toBe(restOf());
  });
});
