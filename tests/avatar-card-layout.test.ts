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

describe("the card's look", () => {
  const theme = (t: string) => fs.readFileSync(path.join(process.cwd(), "public", "themes", `${t}.css`), "utf8");

  it("the shadow, border and radius are on the tilting frame, never on the container or anything around the widget", () => {
    expect(body(".avatar-card__frame")).toMatch(/box-shadow: var\(--avatar-card-shadow, /);
    expect(body(".avatar-card__frame")).toMatch(/border-radius: var\(--radius\)/);
    const SHADOWY = /(^|;|\s)(box-shadow|text-shadow|drop-shadow|mix-blend-mode|isolation|clip-path|mask)\s*:/;
    const hits = all
      .filter((r) => r.selector.split(",").some((s) => [".avatar-card", ".avatar-card__action", ".pt", "body", "html", "main", "*"].includes(s.trim())))
      .filter((r) => SHADOWY.test(r.body))
      .map((r) => `${r.media} ${r.selector}`);
    expect(hits).toEqual([]);
  });

  it("both themes set the optional shadow variable; the card works with the fallback without it", () => {
    for (const t of ["dark-premium", "light-editorial"]) expect(theme(t), t).toContain("--avatar-card-shadow:");
    expect(body(".avatar-card__frame")).toMatch(/box-shadow: var\(--avatar-card-shadow, /);
  });

  it("the caption is a strip below the picture inside the frame, in the theme's surface and text colours, never over the face", () => {
    const c = body(".avatar-card__caption");
    expect(c).toMatch(/position: absolute/);
    expect(c).toMatch(/inset: auto 0 0/);
    expect(c).toMatch(/height: var\(--avatar-strip-h, 8\.5rem\)/);
    expect(c).toMatch(/background: var\(--surface\)/);
    expect(c).toMatch(/color: var\(--text\)/);
    expect(c).toMatch(/pointer-events: none/);
    // the picture ends where the strip starts, and the card is that much taller than its 4:5 picture
    expect(body(".avatar-card--caption .avatar-card__media")).toMatch(/inset: 0 0 var\(--avatar-strip-h, 8\.5rem\)/);
    expect(body(".avatar-card--caption")).toMatch(/height: calc\(var\(--avatar-card-w, 12\.5rem\) \* 1\.25 \+ var\(--avatar-strip-h, 8\.5rem\)\)/);
    expect(body(":root:has(.avatar-card--caption)")).toMatch(/--avatar-card-h: calc\(var\(--avatar-card-w, 12\.5rem\) \* 1\.25 \+ var\(--avatar-strip-h, 8\.5rem\)\)/);
  });

  it("the start button sits on its own line at the foot of the strip: the text keeps clear of it and the widget stays a sibling of the frame", () => {
    expect(body(":root")).toContain("--avatar-strip-h: 8.5rem");
    expect(body(":root")).toMatch(/--avatar-action-h: 4\.25rem/);
    expect(body(".avatar-card__caption")).toMatch(/padding: var\(--space-2\) var\(--space-3\) var\(--avatar-action-h, 4\.25rem\)/);
    expect(body(".avatar-card__caption")).toMatch(/flex-direction: column/); // the tagline shrinks (min-height: 0) before it can run into the button
    expect(body(".avatar-card__tagline")).toMatch(/min-height: 0/);
    expect(body(".avatar-card--caption .avatar-card__action")).toMatch(/bottom: var\(--space-2\)/);
  });

  it("the name and the marker share one line; the separator is CSS, not data; the tagline is clamped to two lines", () => {
    expect(body(".avatar-card__title")).toMatch(/flex-wrap: wrap/);
    expect(body(".avatar-card__badge::before")).toMatch(/content: "\\00b7"/);
    expect(body(".avatar-card__badge")).toMatch(/white-space: nowrap/);
    expect(body(".avatar-card__badge")).not.toMatch(/border/); // no pill
    expect(body(".avatar-card__tagline")).toMatch(/-webkit-line-clamp: 2/);
  });

  it("on the narrow card the caption and the strip are gone and the card is the picture only; under 360px there is no frame at all", () => {
    const NARROW = "@media (width < 40em)";
    expect(body(".avatar-card__caption", NARROW)).toMatch(/display: none/);
    expect(body(".avatar-card--caption", NARROW)).toMatch(/aspect-ratio: 4 \/ 5/);
    expect(body(".avatar-card--caption .avatar-card__media", NARROW)).toMatch(/inset: 0/);
    expect(body(":root:has(.avatar-card--caption)", NARROW)).toMatch(/--avatar-card-h: calc\(var\(--avatar-card-w, 12\.5rem\) \* 1\.25\)/);
    expect(body(".avatar-card", "@media (width < 22.5em), (height < 32.5em)")).toMatch(/height: auto/);
  });
});

describe("our own start button hides the real widget without confining it", () => {
  const WIDE = "@media (width >= 40em) and (height >= 32.5em)";
  const HIDDEN = '.avatar-card:has(.avatar-card__start:not([data-mode="standard"])) hanc-ai-pill-floating-call';

  it("hides the widget's pill and credit with its own parts: visibility and no transition, on a wide card only", () => {
    for (const part of ["pill-button", "floating-container"]) expect(all.some((r) => r.media === WIDE && r.selector.includes(`${HIDDEN}::part(${part})`))).toBe(true);
    const rule = all.find((r) => r.media === WIDE && r.selector.includes("::part(pill-button)") && r.selector.includes(":has("))!;
    expect(rule.body).toMatch(/visibility: hidden/);
    expect(rule.body).toMatch(/transition: none/);
  });

  it("never hides it by opacity, pointer-events, display, clip or filter on the widget or anything around it (its form overlay would inherit that)", () => {
    const RISKY = /(^|;|\s)(opacity|pointer-events|display|clip|clip-path|filter|transform|contain|mask)\s*:/;
    const hits = all
      .filter((r) => r.selector.includes("hanc-ai-pill-floating-call") && !r.selector.includes("::part(pill-button)") && !r.selector.includes("::part(floating-container)") && r.selector.includes(":has("))
      .filter((r) => RISKY.test(r.body))
      .map((r) => `${r.media} ${r.selector}`);
    expect(hits).toEqual([]);
    // the parts themselves: only visibility and transition
    for (const r of all.filter((r) => /::part\((pill-button|floating-container)\)/.test(r.selector) && r.selector.includes(":has(")))
      expect(r.body.replace(/\s+/g, " ").trim()).toBe("visibility: hidden; transition: none;");
    expect(body(HIDDEN, WIDE)).toMatch(/overflow: hidden/); // the host itself is only made 1px, in place of the pill's room
  });

  it("the button shows on the wide card only and in none of the narrow or tiny cases; mode standard hides it", () => {
    expect(body(".avatar-card__start")).toMatch(/display: none/);
    expect(body(".avatar-card__start", WIDE)).toMatch(/display: inline-flex/);
    expect(body('.avatar-card__start[data-mode="standard"]', WIDE)).toMatch(/display: none/);
  });

  it("has the same fixed height in every state and never wraps: nowrap, an ellipsis as a safety net, room kept above it", () => {
    const b = body(".avatar-card__start", WIDE);
    expect(b).toMatch(/height: 2\.25rem/);
    expect(b).toMatch(/white-space: nowrap/);
    expect(b).toMatch(/overflow: hidden/);
    expect(b).not.toMatch(/min-height|padding: var\(--space-2\)/); // no vertical padding that a second line could grow
    const label = all.find((r) => r.media === WIDE && r.selector === ".avatar-card__start > span:not(.avatar-card__start-dot)")!;
    expect(label.body).toMatch(/text-overflow: ellipsis/);
    expect(label.body).toMatch(/min-width: 0/);
    expect(b).toMatch(/padding: 0 var\(--space-2\)/);
    expect(body('.avatar-card__start[data-state="error"] .avatar-card__start-dot', WIDE)).toMatch(/display: none/); // room for the longest label
    // no state rule changes the size
    for (const r of all.filter((r) => r.media === WIDE && r.selector.startsWith(".avatar-card__start[")))
      expect(r.body, r.selector).not.toMatch(/(^|;|\s)(height|width|padding|font-size|white-space|border-width)\s*:/);
    // the strip keeps room for the button: the tagline is cut before it (see the caption rules), at least 0.5rem of air
    expect(body(":root:has(.avatar-card__start:not([data-mode=\"standard\"]))", WIDE)).toMatch(/--avatar-strip-h: 7\.75rem[\s\S]*--avatar-action-h: 3\.5rem/);
  });

  it("has a focus ring, theme colours and no motion under prefers-reduced-motion", () => {
    expect(body(".avatar-card__start:focus-visible", WIDE)).toMatch(/outline: 2px solid var\(--accent\)/);
    expect(body(".avatar-card__start", WIDE)).toMatch(/background: var\(--accent\)/);
    const calm = all.find((r) => r.media === "@media (prefers-reduced-motion: reduce)" && r.selector.includes(".avatar-card__start"))!;
    expect(calm.selector).toContain('.avatar-card__start[data-state="connecting"] .avatar-card__start-dot');
    expect(calm.body).toMatch(/transition: none/);
    expect(calm.body).toMatch(/animation: none/);
  });
});

describe("the wheel icon of the start button", () => {
  const WIDE = "@media (width >= 40em) and (height >= 32.5em)";
  const keyframes = /@keyframes avatar-wheel-spin\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";

  it("is the only animated transform: on .avatar-card__wheel-turn, a group inside the SVG inside the button, never on an ancestor of the widget", () => {
    expect(keyframes).toMatch(/transform: rotate\(360deg\)/);
    // the keyframes are used by exactly one selector, and it is that group
    const users = all.filter((r) => /animation(-name)?:[^;]*avatar-wheel-spin/.test(r.body));
    expect(users.map((r) => r.selector)).toEqual([".avatar-card__wheel-turn"]);
    // no other rule of the card or the button sets transform / rotate / translate / scale (the inline tilt is the frame's only one)
    const others = all.filter((r) => /(^|;|\s)(transform|translate|scale|rotate)\s*:/.test(r.body) && !/^(to|from|\d+%)$/.test(r.selector));
    expect(others.map((r) => r.selector).filter((s) => /avatar-card/.test(s))).toEqual([]);
    // the markup agrees: the turning element is a <g> of the wheel's <svg>, and the wheel is rendered inside the button only
    const icon = read("src", "components", "WheelIcon.tsx");
    expect(icon).toMatch(/<svg className="avatar-card__wheel"[\s\S]*<g className="avatar-card__wheel-turn">/);
    expect(read("src", "components", "AgentStartButton.tsx")).toMatch(/<button[^>]*className="avatar-card__start"[\s\S]*<WheelIcon \/>[\s\S]*<\/button>/);
    expect(read("src", "components", "AgentAvatarCard.tsx")).not.toMatch(/WheelIcon|avatar-card__wheel/);
    expect(read("src", "components", "AgentWidget.tsx")).not.toMatch(/WheelIcon|avatar-card__wheel/);
  });

  it("turns for as long as the call is connected (the button's own data-state), pauses at its angle otherwise, and never turns under prefers-reduced-motion", () => {
    expect(body(".avatar-card__wheel-turn", WIDE)).toMatch(/animation: avatar-wheel-spin 0\.8s linear infinite paused/);
    expect(body('.avatar-card__start[data-state="connected"] .avatar-card__wheel-turn', WIDE)).toMatch(/animation-play-state: running/);
    // nothing but the connected state starts it, and no speech attribute is involved any more
    const runners = all.filter((r) => /animation-play-state:\s*running/.test(r.body)).map((r) => r.selector);
    expect(runners).toEqual(['.avatar-card__start[data-state="connected"] .avatar-card__wheel-turn']);
    expect(css).not.toMatch(/data-speech/);
    const calm = all.find((r) => r.media === "@media (prefers-reduced-motion: reduce)" && r.selector.includes(".avatar-card__wheel-turn"))!;
    expect(calm.body).toMatch(/animation: none/);
    // the error state has no rule that makes it turn
    expect(all.filter((r) => /data-state="error"/.test(r.selector) && /wheel/.test(r.selector) && /animation/.test(r.body))).toEqual([]);
  });

  it("sits inside the pill on the left (size and inset from variables, no overhang), and the label's box starts after it with its text centred", () => {
    expect(body(":root")).toMatch(/--avatar-wheel-size: 1\.75rem/);
    expect(body(":root")).toMatch(/--avatar-wheel-inset: 0\.2rem/);
    expect(css).not.toMatch(/wheel-overhang/);
    const w = body(".avatar-card__wheel", WIDE);
    expect(w).toMatch(/position: absolute/);
    expect(w).toMatch(/inline-size: var\(--avatar-wheel-size, 1\.75rem\)/);
    expect(w).toMatch(/inset-inline-start: var\(--avatar-wheel-inset, 0\.2rem\)/); // positive: inside the edge
    const b = body('.avatar-card__start[data-icon="wheel"]', WIDE);
    // start padding = wheel + inset + gap; the end padding is the ordinary one
    expect(b).toMatch(/padding-inline: calc\(var\(--avatar-wheel-size, 1\.75rem\) \+ var\(--avatar-wheel-inset, 0\.2rem\) \+ var\(--space-2, 0\.5rem\)\) var\(--space-2, 0\.5rem\)/);
    const label = body('.avatar-card__start[data-icon="wheel"] > span', WIDE);
    expect(label).toMatch(/flex: 1 1 auto/);
    expect(label).toMatch(/text-align: center/);
    // the pill keeps its overflow: hidden (nothing is relaxed), the label its ellipsis, and the fixed size is not touched
    expect(b).not.toMatch(/overflow/);
    expect(body(".avatar-card__start", WIDE)).toMatch(/overflow: hidden/);
    expect(all.filter((r) => /avatar-card__start/.test(r.selector) && /overflow:\s*visible/.test(r.body))).toEqual([]);
    expect(all.find((r) => r.media === WIDE && r.selector === ".avatar-card__start > span:not(.avatar-card__start-dot)")!.body).toMatch(/overflow: hidden[\s\S]*text-overflow: ellipsis/);
    expect(b).not.toMatch(/(^|;|\s)(height|width|white-space)\s*:/);
    expect(body(".avatar-card__start", WIDE)).toMatch(/height: 2\.25rem/);
  });

  it("takes its colours from the theme, with fallbacks (optional --avatar-wheel-tyre and --avatar-wheel-rim), and has no raw colour", () => {
    const wheel = all.filter((r) => /avatar-card__wheel/.test(r.selector));
    expect(wheel.find((r) => /wheel-tyre/.test(r.selector))!.body).toMatch(/fill: var\(--avatar-wheel-tyre, color-mix\(in srgb, var\(--accent\) 18%, black\)\)/);
    expect(wheel.find((r) => /wheel-rim/.test(r.selector))!.body).toMatch(/fill: var\(--avatar-wheel-rim, color-mix\(in srgb, var\(--accent\) 22%, white\)\)/);
    for (const r of wheel) expect(r.body, r.selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
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
