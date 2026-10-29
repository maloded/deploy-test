// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// happy-dom cannot measure layout: these tests read the CSS. The real measurement was made in a browser (see PROGRESS.md).
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
const css = read("src", "app", "globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** Blocks `selector { ... }` with the @media prelude that encloses them (one level of nesting, as in this file). */
function rules() {
  const out: { media: string; selector: string; body: string }[] = [];
  const re = /(@media[^{]+)\{|([^{}]+)\{([^{}]*)\}|\}/g;
  const stack: string[] = [];
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m[1]) stack.push(m[1].trim());
    else if (m[2] !== undefined) out.push({ media: stack.join(" | "), selector: m[2].trim().replace(/\s+/g, " "), body: m[3] });
    else stack.pop();
  }
  return out;
}
const all = rules();
const body = (selector: string, media = "") => all.filter((r) => r.selector === selector && r.media === media).map((r) => r.body).join("\n");
const zIndex = (selector: string): number => Number(/z-index:\s*(\d+)/.exec(body(selector))?.[1]);

describe("nothing on the card or above the widget can confine its fixed overlay", () => {
  // the widget's form overlay is position:fixed; an ancestor with any of these becomes its containing block (and so does the
  // widget's own <hanc-ai-pill-call>, which has contain: layout: that is why the card uses <hanc-ai-pill-floating-call>)
  const CONFINING = /(^|;|\s)(transform|translate|scale|rotate|perspective|filter|backdrop-filter|will-change|contain|container-type|content-visibility)\s*:/;
  const ANCESTORS = [".avatar-card", ".avatar-card__action", ".pt", "body", "html", "main", "*"];

  it("no rule for the card, its action area, .pt, body, html or * sets such a property (in any media query)", () => {
    const hits = all
      .filter((r) => r.selector.split(",").some((s) => ANCESTORS.includes(s.trim()) || /^\.pt-[a-z-]+$/.test(s.trim())))
      .filter((r) => CONFINING.test(r.body))
      .map((r) => `${r.media} ${r.selector}`);
    expect(hits).toEqual([]);
  });

  it("no rule of the card sets transform, perspective or the like: the frame's transform is inline, set only while it tilts", () => {
    const hits = all
      .filter((r) => r.selector.split(",").some((s) => /^\.avatar-card/.test(s.trim())))
      .filter((r) => CONFINING.test(r.body))
      .map((r) => `${r.media} ${r.selector}`);
    expect(hits).toEqual([]);
    expect(all.filter((r) => /(^|;|\s)perspective\s*:/.test(r.body))).toEqual([]); // no selector anywhere: the perspective is inside the transform function
  });

  it("the frame owns the border, the radius, the clipping and the background; the card itself has none of them", () => {
    const frame = body(".avatar-card__frame");
    for (const re of [/overflow: hidden/, /border: 1px solid var\(--border\)/, /border-radius: var\(--radius\)/, /background: var\(--surface\)/]) expect(frame).toMatch(re);
    expect(body(".avatar-card")).not.toMatch(/overflow|border|background/);
  });

  it("the components set no confining inline style on the card or the layout", () => {
    expect(read("src", "components", "AgentAvatarCard.tsx")).not.toMatch(/style=\{/);
    expect(read("src", "components", "ProductLayout.tsx")).not.toMatch(/\b(transform|filter|perspective|willChange|backdropFilter|contain)\s*:/);
  });

  it("the card holds <hanc-ai-pill-floating-call>, never <hanc-ai-pill-call> (contain: layout in its host styles)", () => {
    const widget = read("src", "components", "AgentWidget.tsx");
    const avatarBranch = widget.slice(widget.indexOf("if (avatar) {"), widget.indexOf('if (agent.variant === "floating")'));
    expect(avatarBranch).toContain('"hanc-ai-pill-floating-call"');
    expect(avatarBranch).toContain('position: "static"');
    expect(avatarBranch).not.toContain('"hanc-ai-pill-call"');
    expect(avatarBranch).not.toContain('"hanc-ai-inline-call"');
  });
});

describe("the card's place and stacking", () => {
  it("is fixed in the bottom-right corner, 4:5, with the width from a variable", () => {
    const c = body(".avatar-card");
    expect(c).toMatch(/position: fixed/);
    expect(c).toMatch(/right: var\(--space-3\)/);
    expect(c).toMatch(/aspect-ratio: 4 \/ 5/);
    expect(c).toMatch(/width: var\(--avatar-card-w, 12\.5rem\)/);
  });

  it("is about 200px wide on desktop and about 120px on a narrow window", () => {
    expect(body(":root")).toContain("--avatar-card-w: 12.5rem");
    expect(body(":root", "@media (width < 40em)")).toContain("--avatar-card-w: 7.5rem");
  });

  it("floats clear of the bottom edge by a variable, smaller on a narrow window", () => {
    expect(body(".avatar-card")).toMatch(/bottom: var\(--avatar-card-bottom, 6rem\)/);
    expect(body(":root")).toContain("--avatar-card-bottom: 6rem");
    expect(body(":root", "@media (width < 40em)")).toContain("--avatar-card-bottom: 3.5rem");
  });

  it("sits above the review theme switcher and below the widget's privacy modal (z-index 10000)", () => {
    expect(zIndex(".avatar-card")).toBeGreaterThan(zIndex(".theme-switcher"));
    expect(zIndex(".avatar-card")).toBeLessThan(10000);
  });

  it("leaves the native dialogs on top: no dialog or lightbox rule sets a z-index", () => {
    for (const s of [".contact-dialog", ".lightbox", ".contact-dialog[open]", ".lightbox[open]"]) expect(body(s)).not.toMatch(/z-index/);
  });

  it("moves the review theme switcher to the left corner and keeps it from reaching under the card", () => {
    const s = body(".theme-switcher");
    expect(s).toMatch(/left: var\(--space-3\)/);
    expect(s).not.toMatch(/right:/);
    expect(body("body:has(.avatar-card) .theme-switcher")).toContain("var(--avatar-card-w, 12.5rem)");
  });

  it("the footer keeps room for the card's height", () => {
    expect(body(".site-footer--agent-card")).toMatch(/padding-bottom: calc\(var\(--space-5\) \+ var\(--avatar-card-h, 15\.625rem\) \+ var\(--avatar-card-bottom, 6rem\)\)/);
    expect(body(":root")).toContain("--avatar-card-h: calc(var(--avatar-card-w, 12.5rem) * 1.25)");
  });
});

describe("small windows", () => {
  const NARROW = "@media (22.5em <= width < 40em) and (height >= 32.5em)";
  const TINY = "@media (width < 22.5em), (height < 32.5em)";

  it("a narrow window shows the picture with the widget cut down to a small round start button in the corner", () => {
    const part = body(".avatar-card__action hanc-ai-pill-floating-call::part(pill-button)", NARROW);
    expect(part).toMatch(/border-radius: 50%/);
    expect(part).toMatch(/overflow: hidden/);
    expect(part).toMatch(/width: 2\.625rem/);
    expect(part).toMatch(/height: 2\.625rem/);
    expect(body(".avatar-card__action", NARROW)).toMatch(/justify-content: flex-end/);
  });

  it("under 360px wide or 520px tall there is no card, only the widget's own pill in the corner (the button is not cut down there)", () => {
    expect(body(".avatar-card__frame", TINY)).toMatch(/display: none/);
    expect(all.filter((r) => r.media === TINY && r.selector.includes("::part"))).toEqual([]);
  });

  it("the video crossfade is opacity only, and off with reduced motion", () => {
    expect(body(".avatar-card__video")).toMatch(/transition: opacity/);
    expect(body(".avatar-card__video", "@media (prefers-reduced-motion: reduce)")).toMatch(/transition: none/);
  });
});
