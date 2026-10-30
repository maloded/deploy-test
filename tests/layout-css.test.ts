import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Blocks of the form `selector { ... }` (no nesting), with the text of the @media prelude that encloses them. */
function rules() {
  const out: { media: string; selector: string; body: string }[] = [];
  const re = /(@media[^{]+)\{|([^{}]+)\{([^{}]*)\}|\}/g;
  const stack: string[] = [];
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m[1]) stack.push(m[1].trim());
    else if (m[2] !== undefined) out.push({ media: stack.join(" | "), selector: m[2].trim(), body: m[3] });
    else stack.pop();
  }
  return out;
}

const rule = (selector: string, media?: string) => rules().find((r) => r.selector === selector && (media === undefined || r.media === media))!;
const ONE_SCREEN = "@media (min-width: 56em) and (min-height: 37.5em)";
const COMPACT = `${ONE_SCREEN} and (max-height: 50em)`;
const WIDE = "@media (min-width: 56em)";

const heroRules = rules().filter((r) => r.selector.startsWith(".hero"));
const PHOTO_SELECTORS = /hero__(photo|frame|box|image|placeholder|thumbs?|thumb-image)/; // the thumbnails beside the photo are part of the photo zone

describe("one screen in three zones", () => {
  it("applies only to wide and tall enough windows, in em (no pixels)", () => {
    expect(rule(".hero", ONE_SCREEN).media).toBe(ONE_SCREEN);
  });

  it("fills the viewport below the header: 100vh fallback first, then 100svh, both minus --header-h with a rem fallback and --agent-top-h (0 without a top strip)", () => {
    const hero = rule(".hero", ONE_SCREEN);
    const lines = hero.body.split(";").map((l) => l.trim()).filter((l) => l.startsWith("min-height"));
    expect(lines).toEqual([
      "min-height: calc(100vh - var(--header-h, 3.75rem) - var(--agent-top-h, 0rem))",
      "min-height: calc(100svh - var(--header-h, 3.75rem) - var(--agent-top-h, 0rem))",
    ]);
    expect(hero.body).toMatch(/flex-direction:\s*column/);
    expect(rule(".hero__stage", ONE_SCREEN).body).toMatch(/flex:\s*1/);
    expect(rule(".hero__stage", ONE_SCREEN).body).toMatch(/min-height:\s*0/);
    expect(rule(".hero__intro", ONE_SCREEN).body).toMatch(/flex:\s*none/);
  });

  it("has ONE control height for the header's controls (the button's own height by default, 44px on a narrow screen) and derives the header from it", () => {
    const root = rule(":root", "").body;
    expect(root).toMatch(/--header-control-h: calc\(0\.7rem \* var\(--line-height, 1\.55\) \+ var\(--space-2\) \* 2 \+ 2px\)/); // the "Get in touch" button's natural height
    expect(root).toMatch(/--header-h: calc\(var\(--header-control-h, 2\.25rem\) \+ var\(--space-2\) \* 3 \+ 1px\)/);
    expect(rule(":root", "@media (width < 40em)").body).toMatch(/--header-control-h: 2\.75rem/);
    // every control takes its height from the variable and from nowhere else
    for (const sel of [".lang-switch a", ".lang-menu__current", ".site-header__end > .button--small", ".music__button", ".music__select"]) {
      expect(rule(sel).body, sel).toMatch(/height: var\(--header-control-h, 2\.25rem\)/);
    }
    expect(rule(".site-header__inner").body).toMatch(/padding-block: calc\(var\(--space-2\) \* 1\.5\)/);
  });

  it("is as wide as the hero's content: the header and .hero__container share the same max-width, so the brand starts where the title does", () => {
    const max = /max-width:\s*(var\(--container-wide, var\(--container\)\))/;
    expect(rule(".site-header__inner").body).toMatch(max);
    expect(rule(".hero__container").body).toMatch(max);
  });

  it("sets the brand name's size from --brand-size (1.7rem, 1.35rem on a narrow screen) with a line shorter than the control, so the header does not grow", () => {
    expect(rule(":root", "").body).toMatch(/--brand-size: 1\.7rem/);
    expect(rule(":root", "@media (width < 40em)").body).toMatch(/--brand-size: 1\.35rem/);
    const name = rule(".site-header__name", "").body;
    expect(name).toMatch(/font-size: var\(--brand-size, 1\.7rem\)/);
    expect(name).toMatch(/line-height: 1\.1/); // 1.7rem x 1.1 stays under the control's height
    expect(name).toMatch(/font-family: var\(--font-heading\)/);
  });

  it("uses the same header height variable and fallback as the header itself", () => {
    expect(rule(".site-header").body).toContain("min-height: var(--header-h, 3.75rem)");
  });

  it("has no raw pixel heights in any hero rule, and never forces a fixed height", () => {
    for (const r of heroRules) expect(r.body, r.selector).not.toMatch(/height:[^;]*\d+(\.\d+)?px/);
    const wrappers = [".hero", ".hero__stage", ".hero__container", ".hero__intro", ".hero__intro-grid"];
    for (const r of heroRules.filter((x) => wrappers.includes(x.selector))) {
      const heights = [...r.body.matchAll(/(?:^|[;\s])height:\s*([^;]+)/g)].map((m) => m[1].trim());
      expect(heights, r.selector).toEqual([]);
    }
  });

  it("has no scroll hint and no container-query units", () => {
    expect(css).not.toMatch(/hero__scroll|hero-scroll/);
    expect(css).not.toMatch(/container-type|\bcq[wh]\b|\d\s*cq[wh]/);
  });

  it("keeps the normal flow elsewhere: nothing forces a height on the hero", () => {
    expect(rule(".hero", "").body).not.toMatch(/min-height/);
    expect(rule(".hero__stage", "").body).not.toMatch(/min-height/);
    expect(rule(".hero__photo", "").body).toMatch(/aspect-ratio:\s*var\(--media-ratio/); // mobile: the ratio of the type
  });
});

describe("the frame depends only on the window", () => {
  const zone = rule(".hero__photo", ONE_SCREEN);
  const frame = rule(".hero__frame", ONE_SCREEN);
  const box = rule(".hero__box", ONE_SCREEN);

  it("gets all the remaining height, never less than a floor in rem", () => {
    expect(zone.body).toMatch(/flex:\s*1/);
    expect(zone.body).toMatch(/min-height:\s*var\(--hero-frame-min-height,\s*12rem\)/);
    expect(zone.body).toMatch(/grid-template:\s*minmax\(0,\s*1fr\)\s*\/\s*minmax\(0,\s*1fr\)/);
  });

  it("is as tall as the zone, and between --hero-photo-min-width (fallback 40%) and --hero-photo-width (fallback 60%) wide", () => {
    expect(frame.body).toMatch(/height:\s*100%/);
    expect(frame.body).toMatch(/min-width:\s*var\(--hero-photo-min-width,\s*40%\)/);
    expect(frame.body).toMatch(/max-width:\s*var\(--hero-photo-width,\s*60%\)/);
    expect(frame.body).toMatch(/width:\s*auto/);
  });

  it("keeps its ratio between --hero-frame-min-ratio (1) and --hero-frame-max-ratio (16 / 9), both with fallbacks", () => {
    expect(frame.body).toMatch(/aspect-ratio:\s*var\(--hero-frame-max-ratio,\s*1\.7778\)/);
    expect(box.body).toMatch(/aspect-ratio:\s*var\(--hero-frame-min-ratio,\s*1\)/);
    expect(box.body).toMatch(/max-height:\s*100%/);
    expect(box.body).toMatch(/width:\s*100%/);
    expect(box.body).toMatch(/align-self:\s*center/); // centered when it is shorter than the zone
    expect(1.7778).toBeCloseTo(16 / 9, 3);
  });

  it("is centered, with a stable CSS box (the image is absolutely positioned inside it)", () => {
    expect(zone.body).toMatch(/place-items:\s*center/);
    const image = rule(".hero__image", "");
    expect(image.body).toMatch(/position:\s*absolute/);
    expect(image.body).toMatch(/inset:\s*0/);
    expect(image.body).toMatch(/width:\s*100%/);
    expect(image.body).toMatch(/height:\s*100%/);
    expect(rule(".hero__photo", WIDE).body).toMatch(/justify-content:\s*center/); // short wide windows: centered too
  });

  it("fits the photo with cover by default and with contain on a quiet --surface matte, no border or shadow", () => {
    expect(rule(".hero__image", "").body).toMatch(/object-fit:\s*cover/);
    expect(rule('.hero__photo[data-fit="contain"] .hero__image', "").body).toMatch(/object-fit:\s*contain/);
    const matte = rule('.hero__photo[data-fit="contain"] .hero__box', "");
    expect(matte.body).toMatch(/background:\s*var\(--surface\)/);
    expect(matte.body).not.toMatch(/border|shadow|outline/);
    expect(rule(".hero__box", "").body).toMatch(/border-radius:\s*var\(--radius\)/);
    expect(rule(".hero__box", "").body).not.toMatch(/shadow|border:/);
  });

  it("is a plain photo: no frame line, tag, caption, overlay or shadow", () => {
    expect(css).not.toMatch(/hero__(tag|showcase|caption)|showcase-width/);
    for (const r of heroRules.filter((x) => /^\.hero__(photo|frame|box|image)$/.test(x.selector))) {
      expect(r.body, r.selector).not.toMatch(/box-shadow|border:|outline|::|filter/);
    }
  });

  it("is the only part of the hero CSS that knows about the photo (the other zones cannot depend on it)", () => {
    for (const r of heroRules.filter((x) => !PHOTO_SELECTORS.test(x.selector) && x.selector !== ".hero__bg")) { // .hero__bg is the optional decorative background
      expect(r.body, r.selector).not.toMatch(/--media-ratio|object-fit|object-position|--hero-frame|--hero-photo/);
      expect(r.selector, r.selector).not.toMatch(/data-fit/);
    }
  });
});

describe("the bottom row has bounded heights", () => {
  it("clamps the description to 3 lines and the note to 1 line", () => {
    const description = rule(".hero__description", ONE_SCREEN).body;
    expect(description).toMatch(/-webkit-line-clamp:\s*4/);
    expect(description).toMatch(/line-clamp:\s*4/);
    expect(description).toMatch(/overflow:\s*hidden/);
    expect(rule(".hero__note", ONE_SCREEN).body).toMatch(/-webkit-line-clamp:\s*1/);
    // no clamp in the normal flow (mobile and short windows)
    expect(rule(".hero__description", "").body).not.toMatch(/line-clamp/);
    expect(rule(".hero__note", "").body).not.toMatch(/line-clamp/);
  });

  it("gives the buttons a fixed height from a variable with a rem fallback", () => {
    const button = rule(".hero__actions .button", ONE_SCREEN).body;
    expect(button).toMatch(/height:\s*var\(--hero-button-height,\s*3rem\)/);
    expect(button).toMatch(/padding-block:\s*0/);
  });

  it("keeps the key facts in one row of four where they fit and in two by two where they do not: two pairs that wrap by the browser's own measurement of the content (no breakpoint, no forced nowrap that would clip)", () => {
    const list = rule(".hero__facts", "").body;
    expect(list).toMatch(/display:\s*flex/);
    expect(list).toMatch(/flex-wrap:\s*wrap/);
    const pair = rule(".hero__facts-pair", WIDE).body;
    expect(pair).toMatch(/flex:\s*2 1 min-content/); // starts at what its facts need at least, so the pairs wrap only when even that does not fit
    expect(pair).toMatch(/flex-wrap:\s*nowrap/); // a pair never breaks on wide windows: no stray column
    expect(pair).toMatch(/min-width:\s*min-content/);
    const fact = rule(".hero__fact", "").body;
    expect(fact).toMatch(/flex:\s*1 1 0/); // equal shares where every value fits its share
    expect(fact).toMatch(/min-width:\s*min-content/); // never narrower than its value
    expect(rules().filter((r) => r.selector === ".hero__facts" && /nowrap/.test(r.body))).toEqual([]);
    // on phones the pair is a row of two facts that stacks to one column when they do not fit side by side
    expect(rule(".hero__facts-pair", "").body).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".hero__facts", COMPACT).body).not.toMatch(/flex-wrap/);
  });

  it("puts the same space on each side of every divider (the gap is two --fact-pad, the divider in the middle of it, as tall as the cell) and clips the one that would start a row", () => {
    const list = rule(".hero__facts", "").body;
    expect(list).toMatch(/--fact-pad:\s*1rem/);
    expect(list).toMatch(/gap:\s*var\(--space-4\) calc\(var\(--fact-pad, 1rem\) \* 2\)/);
    expect(list).toMatch(/overflow:\s*hidden/); // what lies left of the list is the divider of a fact that starts a row
    expect(rule(".hero__facts-pair", "").body).toMatch(/gap:\s*var\(--space-4\) calc\(var\(--fact-pad, 1rem\) \* 2\)/);
    const divider = rule(".hero__fact::before", "").body;
    expect(divider).toMatch(/inset-block:\s*0/);
    expect(divider).toMatch(/inset-inline-start:\s*calc\(var\(--fact-pad, 1rem\) \* -1 - 1px\)/);
    expect(divider).toMatch(/width:\s*1px/);
    expect(divider).toMatch(/background:\s*var\(--border\)/);
    // no rule draws a divider from a sibling or a position (that was the stray one on a wrapped fact)
    expect(css).not.toMatch(/hero__fact\s*\+\s*\.hero__fact|hero__fact:first-child|hero__fact:last-child|hero__fact:nth-child/);
  });

  it("is more compact on short laptop windows: side-by-side buttons, 2 lines, no trust line, less padding", () => {
    expect(rule(".hero__actions", COMPACT).body).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(rule(".hero__description", COMPACT).body).toMatch(/line-clamp:\s*4/);
    expect(rule(".hero__trust", COMPACT).body).toMatch(/display:\s*none/);
    expect(rule(".hero__intro-grid", COMPACT).body).toMatch(/padding-block:\s*var\(--space-3\)/);
    expect(rule(".hero__stage", COMPACT).body).toMatch(/padding-top:\s*var\(--space-3\)/);
  });

  it("makes the figure a little smaller in the compact form (a rem-only clamp, never below 1.5rem), and nothing else's text", () => {
    const amount = rule(".hero__amount", COMPACT).body;
    const m = /font-size:\s*clamp\(\s*([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\s*\)/.exec(amount);
    expect(m, amount).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1.5); // the base text size is 1rem; the figure stays clearly larger
    expect(Number(m![3])).toBeLessThan(2.8); // smaller than the normal figure (clamp up to 2.8rem)
    expect(rule(".hero__amount", "").body).toMatch(/clamp\(2rem,\s*4vw,\s*2\.8rem\)/);
    // the description, facts, note and headline keep their sizes; the compact rules touch only spacing, clamps and columns
    for (const r of rules().filter((x) => x.media === COMPACT && /description|facts|fact|note|headline/.test(x.selector))) {
      expect(r.body, r.selector).not.toMatch(/font-size/);
    }
  });

  it("hides neither the facts, the description, the note nor the buttons in the compact form", () => {
    for (const r of rules().filter((x) => x.media === COMPACT && /description|facts|fact|note|figure|actions|button/.test(x.selector))) {
      expect(r.body, r.selector).not.toMatch(/display:\s*none/);
    }
    // the note is clamped to one line (visible), the description to 2
    expect(rule(".hero__note", ONE_SCREEN).body).toMatch(/line-clamp:\s*1/);
    expect(rule(".hero__description", COMPACT).body).toMatch(/line-clamp:\s*4/);
  });

  it("puts the two buttons side by side with equal width in the compact form", () => {
    expect(rule(".hero__actions", COMPACT).body).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(rule(".hero__actions .button", ONE_SCREEN).body).toMatch(/height:\s*var\(--hero-button-height,\s*3rem\)/); // same height
    expect(rule(".hero__actions .button", "").body).toMatch(/width:\s*100%/);
  });
});

describe("long words never widen the page", () => {
  /** Elements that hold running text. Each needs hyphens: auto and overflow-wrap: anywhere as a safety net. */
  const TEXT = [".details__label", ".details__value", ".faq__question", ".faq__answer", ".button", ".hero__description", ".offer__note", ".offer__disclaimer", ".site-header__name", ".hero__trust li", ".site-footer", "h1", "h2", "h3"];

  it("gives every text element hyphens: auto and overflow-wrap: anywhere (spec values, FAQ, buttons, headings, footer)", () => {
    const net = rules().find((r) => /hyphens:\s*auto/.test(r.body) && /overflow-wrap:\s*anywhere/.test(r.body) && r.media === "")!;
    const selectors = net.selector.split(",").map((x) => x.trim());
    for (const sel of TEXT) expect(selectors, sel).toContain(sel);
  });

  it("lets grid and flex children shrink (min-width: 0)", () => {
    const rule = rules().find((r) => /min-width:\s*0\b/.test(r.body) && r.selector.includes(".details__row > *"))!;
    for (const sel of [".details__row > *", ".hero__intro-grid > *", ".offer__columns > *", ".specs__group", ".faq__item", ".hero__fact"]) {
      expect(rule.selector, sel).toContain(sel);
    }
  });

  it("keeps the fact values on one line (nowrap, no hyphenation) at a rem size between the base size and 1.75rem", () => {
    const base = rule(".hero__fact-value", "").body;
    expect(base).toMatch(/white-space:\s*nowrap/);
    expect(base).toMatch(/overflow-wrap:\s*normal/);
    expect(base).toMatch(/hyphens:\s*manual/);
    const sizes = rules().filter((r) => r.selector === ".hero__fact-value").flatMap((r) => [...r.body.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size, size).toMatch(/^(\d+(\.\d+)?rem|clamp\(\s*\d+(\.\d+)?rem,\s*[\d.]+vw,\s*\d+(\.\d+)?rem\s*\))$/); // rem only, theme-safe
      const rems = [...size.matchAll(/(\d+(?:\.\d+)?)rem/g)].map((m) => Number(m[1]));
      for (const r of rems) expect(r, size).toBeGreaterThanOrEqual(1.25); // always above the base text size (1rem)
      for (const r of rems) expect(r, size).toBeLessThanOrEqual(1.75);
    }
    expect(css).not.toMatch(/hero__fact-value[^{]*\{[^}]*font-size:\s*[\d.]+px/);
  });

  it("does not hide any hero text in the compact form (only the trust line goes)", () => {
    for (const r of rules().filter((x) => x.media === COMPACT)) {
      if (r.selector === ".hero__trust") continue;
      expect(r.body, r.selector).not.toMatch(/display:\s*none/);
    }
  });
});

describe("hero widths and type", () => {
  it("are fractions of --container-wide, falling back to --container", () => {
    expect(rule(".hero__container", "").body).toMatch(/max-width:\s*var\(--container-wide,\s*var\(--container\)\)/);
  });

  it("makes the headline at most 80% wide, centered", () => {
    expect(rule(".hero__headline", WIDE).body).toMatch(/max-width:\s*80%/);
    expect(rule(".hero__stage", "").body).toMatch(/text-align:\s*center/);
  });

  it("sizes the headline from --hero-headline-size with a fallback, tight and balanced (no fixed 5rem clamp)", () => {
    const headline = rule(".hero__headline", "").body;
    expect(headline).toMatch(/font-size:\s*var\(--hero-headline-size,\s*clamp\(1\.9rem,\s*4vw,\s*3\.25rem\)\)/);
    expect(headline).not.toMatch(/(?<![\d.])5rem/);
    expect(headline).toMatch(/line-height:\s*1\.0\d?\b/);
    expect(headline).toMatch(/text-wrap:\s*balance/);
    expect(css).not.toMatch(/clamp\([^)]*,\s*5rem\)/);
  });
});

describe("intro row", () => {
  it("starts with a thin line from --border and --space-6 of padding on wide screens", () => {
    expect(rule(".hero__intro-grid", "").body).toMatch(/border-top:\s*1px solid var\(--border\)/);
    expect(rule(".hero__intro-grid", WIDE).body).toMatch(/padding-block:\s*var\(--space-6\)/);
  });

  it("has two columns of 58% and 35% on the container edges, same top edge, the right one right-aligned", () => {
    const grid = rule(".hero__intro-grid", WIDE).body;
    expect(grid).toMatch(/grid-template-columns:\s*58%\s+35%/);
    expect(grid).toMatch(/justify-content:\s*space-between/);
    expect(rule(".hero__intro-grid", "").body).not.toMatch(/align-items:\s*(center|end)/); // default: same top edge
    expect(rule(".hero__intro-aside", WIDE).body).toMatch(/text-align:\s*right/);
    expect(rule(".hero__figure", WIDE).body).toMatch(/align-items:\s*flex-end/);
  });

  it("stacks two equal full-width buttons with a --space-3 gap (mobile first)", () => {
    expect(rule(".hero__actions", "").body).toMatch(/display:\s*grid/);
    expect(rule(".hero__actions", "").body).toMatch(/gap:\s*var\(--space-3\)/);
    expect(rule(".hero__actions .button", "").body).toMatch(/width:\s*100%/);
  });

  it("draws the outlined button with a 1px accent outline and no raw color", () => {
    const outline = rule(".button--outline", "");
    expect(outline.body).toMatch(/background:\s*transparent/);
    expect(outline.body).toMatch(/color:\s*var\(--accent\)/);
    expect(rule(".button", "").body).toMatch(/border:\s*1px solid var\(--accent\)/);
  });

  it("shows the key facts in two by two on mobile (one column where two do not fit) and with dividers", () => {
    expect(rule(".hero__facts-pair", "").body).toMatch(/flex:\s*1 1 100%/);
    expect(rule(".hero__fact-value", "").body).toMatch(/font-family:\s*var\(--font-heading\)/);
    expect(rule(".hero__fact-value", "").body).toMatch(/font-variant-numeric:\s*lining-nums tabular-nums/);
    expect(rule(".hero__fact-label", "").body).toMatch(/text-transform:\s*uppercase/);
  });

  it("centers the trust items: stacked on mobile, one line with separators on wide screens", () => {
    expect(rule(".hero__trust", "").body).toMatch(/flex-direction:\s*column/);
    expect(rule(".hero__trust", "").body).toMatch(/align-items:\s*center/);
    expect(rules().some((r) => r.selector === ".hero__trust li + li::before" && r.media === "")).toBe(false); // no dangling dots on mobile
    expect(rule(".hero__trust", WIDE).body).toMatch(/flex-direction:\s*row/);
    expect(rule(".hero__trust", WIDE).body).toMatch(/justify-content:\s*center/);
    expect(rule(".hero__trust li + li::before", WIDE).body).toMatch(/content:\s*"·"/);
  });
});

describe("thumbnail strip fades and offer", () => {
  it("paints the edge fades with theme variables", () => {
    const fades = rules().filter((r) => /^\.gallery__thumbs-wrap::(before|after)$/.test(r.selector) && /gradient/.test(r.body));
    expect(fades).toHaveLength(2);
    for (const r of fades) expect(r.body).toContain("var(--bg)");
  });

  it("puts the disclaimer under the columns with a modest gap", () => {
    const disclaimer = rule(".offer__disclaimer", "");
    expect(disclaimer.body).toMatch(/margin-top:\s*var\(--space-4\)/);
    expect(css).not.toContain("offer__inner--split");
    expect(rules().some((r) => r.selector === ".offer__disclaimer" && /grid-column/.test(r.body))).toBe(false);
  });
});
