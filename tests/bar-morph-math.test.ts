import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BAR_MORPH, clipInset, clipWithin, counterRadius, ease, fadeAt, fadeEnd, mixShape, overlap, part } from "@/lib/bar-morph";

const card = { left: 48, top: 270, width: 280, height: 350, radius: 28 };
const pill = { left: 12, top: 755, width: 366, height: 72, radius: 36 };

describe("the morph's numbers", () => {
  it("is 350 ms, ease-out like the desktop flight", () => {
    expect(BAR_MORPH.ms).toBe(350);
    expect(BAR_MORPH.ease).toEqual([0.23, 1, 0.32, 1]);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.25)).toBeGreaterThan(0.5); // fast at the start, settling
  });

  it("mixes the shape's box and radius linearly", () => {
    expect(mixShape(card, pill, 0)).toEqual(card);
    expect(mixShape(card, pill, 1)).toEqual(pill);
    expect(mixShape(card, pill, 0.5)).toEqual({ left: 30, top: 512.5, width: 323, height: 211, radius: 32 });
  });

  it("part is the share of a window, clamped", () => {
    expect(part(0.2, 0.3, 0.7)).toBe(0);
    expect(part(0.5, 0.3, 0.7)).toBeCloseTo(0.5);
    expect(part(0.9, 0.3, 0.7)).toBe(1);
  });
});

describe("the fades", () => {
  it("going to the bar the card's layers go and the bar's own parts come, the bar's parts later", () => {
    expect(fadeEnd("toBar")).toEqual({ card: 0, pill: 1 });
    expect(fadeEnd("toCard")).toEqual({ card: 1, pill: 0 });
    const start = fadeEnd("toCard");
    expect(fadeAt(0, "toBar", start)).toEqual({ card: 1, pill: 0 });
    expect(fadeAt(1, "toBar", start)).toEqual({ card: 0, pill: 1 });
    const mid = fadeAt(0.55, "toBar", start);
    expect(mid.card).toBeLessThan(1);
    expect(mid.card).toBeGreaterThan(0);
    expect(mid.pill).toBe(0); // the bar's own parts wait until the shape is nearly the bar
    expect(fadeAt(0.2, "toBar", start).card).toBe(1); // and the card's layers hold at first
  });

  it("going back it is the other way round: the bar's parts go first, the card comes in after", () => {
    const start = fadeEnd("toBar");
    expect(fadeAt(0, "toCard", start)).toEqual({ card: 0, pill: 1 });
    expect(fadeAt(1, "toCard", start)).toEqual({ card: 1, pill: 0 });
    expect(fadeAt(0.2, "toCard", start).card).toBe(0);
    expect(fadeAt(0.4, "toCard", start).pill).toBe(0);
  });

  it("a morph taken over in the air starts from the fades it had, so nothing jumps, and ends where the new direction ends", () => {
    const inTheAir = fadeAt(0.55, "toBar", fadeEnd("toCard"));
    const reversed = fadeAt(0, "toCard", inTheAir);
    expect(reversed).toEqual(inTheAir); // the first frame of the reverse is the last of the forward
    expect(fadeAt(1, "toCard", inTheAir)).toEqual({ card: 1, pill: 0 });
    for (let e = 0; e <= 1; e += 0.05) {
      const f = fadeAt(e, "toCard", inTheAir);
      expect(f.card).toBeGreaterThanOrEqual(0);
      expect(f.card).toBeLessThanOrEqual(1);
      expect(f.pill).toBeGreaterThanOrEqual(0);
      expect(f.pill).toBeLessThanOrEqual(1);
    }
  });

  it("each part moves one way only (no flicker): the card's layers never go back up on the way to the bar", () => {
    let last = 1;
    for (let e = 0; e <= 1.0001; e += 0.02) {
      const c = fadeAt(Math.min(1, e), "toBar", fadeEnd("toCard")).card;
      expect(c).toBeLessThanOrEqual(last + 1e-9);
      last = c;
    }
  });
});

describe("the shapes as clip-paths", () => {
  it("inset() with the rounded corners, in the viewport's own px", () => {
    expect(clipInset(pill, 390, 844)).toBe("inset(755.00px 12.00px 17.00px 12.00px round 36.00px)");
  });
  it("keeps the insets at 0 or more for a shape that is partly above the window", () => {
    expect(clipInset({ ...card, top: -100 }, 390, 844)).toMatch(/^inset\(0\.00px /);
  });
  it("cuts the real bar to what the shape covers now: nothing while they do not meet, the whole bar once the shape is the bar", () => {
    expect(clipWithin(pill, card)).toBe("inset(100% 100% 100% 100%)");
    expect(clipWithin(pill, pill)).toBe("inset(0.00px 0.00px 0.00px 0.00px round 36.00px)");
    const half = clipWithin(pill, { left: 12, top: 790, width: 366, height: 100, radius: 20 });
    expect(half).toBe("inset(35.00px 0.00px 0.00px 0.00px round 20.00px)");
  });
  it("overlap of two boxes", () => {
    expect(overlap({ left: 0, top: 0, width: 10, height: 10 }, { left: 5, top: 5, width: 10, height: 10 })).toEqual({ left: 5, top: 5, width: 5, height: 5 });
    expect(overlap({ left: 0, top: 0, width: 10, height: 10 }, { left: 20, top: 0, width: 5, height: 5 })).toBeNull();
  });
  it("gives the shadow layer elliptical corners that a scale turns into round ones", () => {
    expect(counterRadius(28, 1, 1)).toBe("28.00px / 28.00px");
    expect(counterRadius(36, 2, 0.5)).toBe("18.00px / 72.00px");
  });
});

describe("the stylesheet of the morph", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const from = css.indexOf("The morph of the card into the call bar and back");
  const block = css.slice(css.indexOf("*/", from) + 2); // after the comment that introduces it
  const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2] }));

  it("puts the back layer under the card (1099) and the button's copy over it (1101), both click-through", () => {
    const get = (sel: string) => rules.find((r) => r.selector.replace(/\s+/g, " ") === sel.replace(/\s+/g, " "))!.body;
    expect(get(".card-morph")).toMatch(/z-index: 1099;/);
    expect(get(".card-morph__top")).toMatch(/z-index: 1101;/);
    expect(rules.filter((r) => r.selector.replace(/\s+/g, " ") === ".card-morph, .card-morph__top").map((r) => r.body).join(" ")).toMatch(/position: fixed;[\s\S]*pointer-events: none;/);
  });

  it("no rule of the morph sets a transform or anything else that would confine a fixed overlay: all of that is inline from the script, on elements that are not the widget's ancestors", () => {
    const CONFINING = /(^|;|\s)(transform|translate|scale|rotate|perspective|filter|backdrop-filter|will-change|contain|container-type|content-visibility)\s*:/;
    for (const r of rules.filter((r) => /card-morph/.test(r.selector))) {
      const body = r.body.replace(/transform-origin:[^;]*;/g, ""); // an origin moves nothing
      expect(body, r.selector).not.toMatch(CONFINING);
    }
  });

  it("is not drawn under reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.card-morph,\s*\.card-morph__top \{\s*display: none;/);
  });
});
