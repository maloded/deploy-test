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

  it("the tile owns the clipping and the stage colour, the frame the radius and the lift; the card itself has none of them", () => {
    const tile = body(".avatar-card__tile");
    for (const re of [/overflow: hidden/, /border-radius: var\(--avatar-card-radius, 1\.75em\)/, /background: var\(--avatar-stage, black\)/]) expect(tile).toMatch(re);
    const frame = body(".avatar-card__frame");
    // no overflow on the frame: it would flatten the depth of the caption layers (transform-style: preserve-3d)
    expect(frame).not.toMatch(/overflow/);
    expect(frame).toMatch(/transform-style: preserve-3d/);
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
    expect(body(".avatar-card__frame")).toMatch(/border-radius: var\(--avatar-card-radius, 1\.75em\)/);
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

  it("the layers over the picture are the Hanc ones: a shade 58% high, a glint that blends, a 2px masked ring that is dark while idle", () => {
    expect(body(".avatar-card__shade")).toMatch(/height: 58%/);
    expect(body(".avatar-card__glint")).toMatch(/mix-blend-mode: screen/);
    expect(body(".avatar-card__glint")).toMatch(/pointer-events: none/);
    expect(body(".avatar-card[data-tilting] .avatar-card__glint")).toMatch(/opacity: 1/);
    const ring = body(".avatar-card__ring");
    expect(ring).toMatch(/padding: 2px/);
    expect(ring).toMatch(/background: var\(--avatar-ring, /);
    expect(ring).toMatch(/opacity: 0/);
    expect(body('.avatar-card[data-call="connecting"] .avatar-card__ring')).toMatch(/opacity: 0\.55/);
    expect(body('.avatar-card[data-call="connected"] .avatar-card__ring')).toMatch(/opacity: 1/);
    expect(body('.avatar-card[data-call="connected"] .avatar-card__frame')).toMatch(/box-shadow: 0 2\.5em 5\.625em -2\.5em var\(--avatar-glow, /);
  });

  it("every colour of the card is a theme token (with a fallback drawn from the accent, never a raw colour)", () => {
    for (const r of all.filter((r) => /avatar-card/.test(r.selector)))
      expect(r.body, r.selector).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    for (const t of ["dark-premium", "light-editorial"]) for (const v of ["--avatar-ring", "--avatar-glow", "--avatar-pill", "--avatar-orb-a", "--avatar-orb-b", "--avatar-stage", "--avatar-ink"]) expect(theme(t), `${t} ${v}`).toContain(`${v}:`);
  });

  it("sizes are in em: 1em is 1rem in the hero from a card 20rem wide (as on the Hanc page) and shrinks with the width below it, the card's width / 16 when docked", () => {
    expect(body(".avatar-card")).toMatch(/font-size: calc\(var\(--avatar-card-w, 12\.5rem\) \/ 16\)/);
    expect(body('.avatar-card[data-placement="hero"]')).toMatch(/font-size: clamp\(0\.75rem, calc\(var\(--avatar-slot-w, 20rem\) \/ 20\), 1rem\)/);
    expect(body(".avatar-card__name")).toMatch(/font-size: 1\.75em/);
  });

  it("on the narrow docked card the plate and the layers are gone and the card is the picture only, with the theme's border and radius; under 360px there is no frame at all", () => {
    const NARROW = "@media (width < 40em)";
    const sel = (n: string) => `.avatar-card[data-placement="dock"] .avatar-card__${n}`;
    const hidden = all.find((r) => r.media === NARROW && r.selector.includes(sel("plate")))!;
    for (const n of ["plate", "shade", "glint", "ring"]) expect(hidden.selector).toContain(sel(n));
    expect(hidden.body).toMatch(/display: none/);
    expect(body(sel("tile"), NARROW)).toMatch(/border: 1px solid var\(--border\)/);
    expect(body(":root")).toContain("--avatar-card-h: calc(var(--avatar-card-w, 12.5rem) * 1.25)");
    expect(body('.avatar-card[data-placement="dock"]', "@media (width < 22.5em), (height < 32.5em)")).toMatch(/height: auto/);
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
    const b = body(".avatar-card__start");
    expect(b).toMatch(/height: 2\.25rem/);
    expect(b).toMatch(/white-space: nowrap/);
    expect(b).toMatch(/overflow: hidden/);
    expect(b).not.toMatch(/min-height|padding: var\(--space-2\)/); // no vertical padding that a second line could grow
    const label = all.find((r) => r.media === "" && r.selector === ".avatar-card__start > span:not(.avatar-card__start-dot)")!;
    expect(label.body).toMatch(/text-overflow: ellipsis/);
    expect(label.body).toMatch(/min-width: 0/);
    expect(b).toMatch(/padding: 0 var\(--space-2\)/);
    expect(body('.avatar-card__start[data-state="error"] .avatar-card__start-dot')).toMatch(/display: none/); // room for the longest label
    // no state rule changes the size (the orb pill grows on purpose, as on Hanc: its label slides out inside its own dock)
    for (const r of all.filter((r) => r.media === "" && r.selector.startsWith(".avatar-card__start[") && r.selector.includes("[data-state") && !r.selector.includes('[data-icon="orb"]')))
      expect(r.body, r.selector).not.toMatch(/(^|;|\s)(height|width|padding|font-size|white-space|border-width)\s*:/);
  });

  it("has a focus ring, theme colours and no motion under prefers-reduced-motion", () => {
    expect(body(".avatar-card__start:focus-visible")).toMatch(/outline: 2px solid var\(--accent\)/);
    expect(body(".avatar-card__start")).toMatch(/background: var\(--accent\)/);
    const calm = all.find((r) => r.media === "@media (prefers-reduced-motion: reduce)" && r.selector.includes(".avatar-card__start"))!;
    expect(calm.selector).toContain('.avatar-card__start[data-state="connecting"] .avatar-card__start-dot');
    expect(calm.body).toMatch(/transition: none/);
    expect(calm.body).toMatch(/animation: none/);
  });
});

describe("the wheel icon of the start button", () => {
  const WIDE = ""; // the style rules are not tied to a media query: the button is displayed where it shows (a wide card, the hero card), see below
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

  it("the footer keeps room for the card's height on narrow and tiny windows only", () => {
    expect(body(".site-footer--agent-card")).toMatch(/padding-bottom: calc\(var\(--space-5\) \+ var\(--avatar-card-h, 15\.625rem\) \+ var\(--avatar-card-bottom, 6rem\)\)/);
    const WIDE = "@media (width >= 40em) and (height >= 32.5em)";
    // wide windows: no vertical reserve (no dead zone below the footer), a reserve on the right where the card sits
    expect(body(".site-footer--agent-card", WIDE)).toMatch(/padding-bottom: var\(--space-5\)/);
    const side = body(".site-footer--agent-card .site-footer__inner", WIDE);
    expect(side).toMatch(/padding-right: max\(var\(--space-4\), calc\(var\(--avatar-card-w, 12\.5rem\) \+ var\(--space-3\) \* 2 \+ 1\.25rem - max\(0rem, \(100vw - var\(--container\)\) \/ 2\)\)\)/);
    expect(side).not.toMatch(/(^|;|\s)(transform|translate|scale|rotate|filter|contain)\s*:/);
    expect(body(":root")).toContain("--avatar-card-h: calc(var(--avatar-card-w, 12.5rem) * 1.25)");
  });
});

describe("small windows", () => {
  const NARROW = "@media (22.5em <= width < 40em) and (height >= 32.5em)";
  const TINY = "@media (width < 22.5em), (height < 32.5em)";

  it("a narrow window shows the picture with the widget cut down to a small round start button in the corner", () => {
    const part = body('.avatar-card[data-placement="dock"] .avatar-card__action hanc-ai-pill-floating-call::part(pill-button)', NARROW);
    expect(part).toMatch(/border-radius: 50%/);
    expect(part).toMatch(/overflow: hidden/);
    expect(part).toMatch(/width: 2\.625rem/);
    expect(part).toMatch(/height: 2\.625rem/);
    expect(body('.avatar-card[data-placement="dock"] .avatar-card__action', NARROW)).toMatch(/justify-content: flex-end/);
  });

  it("under 360px wide or 520px tall there is no card, only the widget's own pill in the corner (the button is not cut down there)", () => {
    expect(body('.avatar-card[data-placement="dock"] .avatar-card__frame', TINY)).toMatch(/display: none/);
    expect(all.filter((r) => r.media === TINY && r.selector.includes("::part"))).toEqual([]);
  });

  it("the video crossfade is opacity only, and off with reduced motion", () => {
    expect(body(".avatar-card__video")).toMatch(/transition: opacity/);
    expect(body(".avatar-card__video", "@media (prefers-reduced-motion: reduce)")).toMatch(/transition: none/);
  });
});

describe("Hanc's call button (the orb start button, ported for the hidden widget)", () => {
  const WIDE = "@media (width >= 40em) and (height >= 32.5em)";
  const BTN = '.call-orb .call-orb__btn[data-icon="orb"]';

  it("the action area is the 7.25em (116px) dock at the card's lower right on the large card at any width and on a wide docked card; the orb is 100px (6.25em) in it", () => {
    for (const [sel, media] of [['.avatar-card[data-icon="orb"][data-placement="hero"]', ""], ['.avatar-card[data-icon="orb"][data-placement="dock"]', WIDE]]) {
      const dock = body(`${sel} .avatar-card__action`, media);
      expect(dock, sel).toMatch(/inset: auto 0\.5em 0\.5em auto/);
      expect(dock, sel).toMatch(/width: 7\.25em/);
      expect(dock, sel).toMatch(/height: 7\.25em/);
      expect(body(`${sel} .call-orb`, media), sel).toMatch(/display: block/);
    }
    expect(body(".call-orb")).toMatch(/display: none/); // not shown where the button is not
    expect(body(".call-orb")).toMatch(/inset: 0\.5em/);
  });

  it("the pill is Hanc's: 3px padding, 24px radius, the pill token, the dark text, 14px bold label, the library's 0.3s easing, centred by translate(-50%, -50%)", () => {
    const pill = body(BTN);
    expect(pill).toMatch(/padding: 0\.1875em/);
    expect(pill).toMatch(/border-radius: 1\.5em/);
    expect(pill).toMatch(/background: var\(--avatar-pill, /);
    expect(pill).toMatch(/color: var\(--avatar-stage, black\)/);
    expect(pill).toMatch(/font-weight: 700/);
    expect(pill).toMatch(/letter-spacing: -0\.01em/);
    expect(pill).toMatch(/box-shadow: 0 0\.625em 1\.5em -0\.625em color-mix\(in srgb, black 70%, transparent\)/);
    expect(pill).toMatch(/transform: translate\(var\(--call-orb-x, -50%\), -50%\)/);
    expect(pill).toMatch(/transition: all 0\.3s cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    expect(body(".call-orb__icon")).toMatch(/width: 2\.75em/); // the 44px disc
    expect(body(".call-orb__icon")).toMatch(/background: var\(--avatar-stage, black\)/);
    expect(body(".call-orb__text")).toMatch(/font-size: 0\.875em/);
  });

  it("the label slides out on hover of the orb (idle only) and on focus, at the library's 0.3s easing, and stays out while connecting and after an error; a touch screen has no hover rule", () => {
    const HOVER = "@media (hover: hover)";
    expect(body(".call-orb__label")).toMatch(/max-width: 0/);
    expect(body(".call-orb__label")).toMatch(/transition:\s*max-width 0\.3s cubic-bezier\(0\.4, 0, 0\.2, 1\),\s*padding 0\.3s cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    expect(body(".call-orb:hover .call-orb__btn[data-state=\"idle\"] .call-orb__label", HOVER)).toMatch(/max-width: calc\(var\(--call-orb-w, 14em\) \+ 1\.25em\);\s*padding: 0 0\.75em 0 0\.5em/);
    expect(body(".call-orb:hover .call-orb__btn[data-state=\"idle\"] .call-orb__text", HOVER)).toMatch(/opacity: 1/);
    expect(body(".call-orb:hover .call-orb__btn[data-state=\"idle\"]", HOVER)).toMatch(/scale\(1\.05\)/);
    expect(body(".call-orb:hover", HOVER)).toMatch(/transform: scale\(1\.02\)/);
    expect(body('.call-orb__btn[data-state="idle"]:focus-visible .call-orb__label')).toMatch(/max-width: calc\(var\(--call-orb-w, 14em\) \+ 1\.25em\)/);
    const shown = all.find((r) => r.selector.includes('.call-orb__btn[data-state="connecting"] .call-orb__label'))!;
    expect(shown.selector).toContain('.call-orb__btn[data-state="error"] .call-orb__label');
    expect(shown.body).toMatch(/max-width: calc\(var\(--call-orb-w, 14em\) \+ 1\.25em\)/);
    // no hover rule outside the media query: a tap must not leave the label stuck open
    expect(all.filter((r) => r.media === "" && /:hover/.test(r.selector) && /call-orb/.test(r.selector))).toEqual([]);
    expect(body(".call-orb:active .call-orb__btn")).toMatch(/scale\(0\.97\)/);
    expect(body(`${BTN}[aria-disabled="true"]`)).toMatch(/opacity: 0\.7/);
  });

  it("the docked card grows the label to the left (it sits at the window's edge), the large card centres it as Hanc does", () => {
    expect(body('.avatar-card[data-placement="dock"] .call-orb')).toMatch(/--call-orb-x: calc\(-100% \+ 1\.5625em\)/);
    expect(body(BTN)).toMatch(/var\(--call-orb-x, -50%\)/);
  });

  it("the orb is a CSS sphere in the tangerine-neon colours, with Hanc's rings: two rest rings, waves on burst, idle and busy, all off with reduced motion", () => {
    expect(body(".call-orb__glow")).toMatch(/radial-gradient\(circle closest-side at 50% 50%/);
    expect(body(".call-orb__glow")).toMatch(/var\(--avatar-orb-a, var\(--accent\)\)/);
    expect(body(".call-orb__rings > i:nth-child(1)")).toMatch(/opacity: 0\.5/);
    expect(body(".call-orb__rings > i:nth-child(2)")).toMatch(/opacity: 0\.22/);
    expect(body('.avatar-card[data-rings="burst"] .call-orb__rings > i:nth-child(n + 3)')).toMatch(/avatar-ring-wave 1\.9s/);
    expect(body('.avatar-card[data-rings="idle"] .call-orb__rings > i:nth-child(3)')).toMatch(/avatar-ring-rest 7s [^;]* 2s infinite/);
    expect(body('.avatar-card[data-rings="busy"] .call-orb__rings > i:nth-child(n + 3)')).toMatch(/avatar-ring-wave 1\.8s [^;]* infinite/);
    const calm = body(".call-orb__rings > i:nth-child(n + 3)", "@media (prefers-reduced-motion: reduce)");
    expect(calm).toMatch(/animation: none !important/);
    expect(calm).toMatch(/opacity: 0 !important/);
    // the orb's own motion is behind no-preference
    expect(body(".call-orb__swirl", "@media (prefers-reduced-motion: no-preference)")).toMatch(/animation: call-orb-swirl/);
    expect(body(".call-orb__swirl")).not.toMatch(/animation/);
  });

  it("no rule of the card (.avatar-card*) carries a transform: the call button's transforms are on .call-orb selectors, siblings of the widget", () => {
    const rules = all.filter((r) => /call-orb/.test(r.selector));
    expect(rules.length).toBeGreaterThan(10);
    for (const r of rules) expect(r.selector.split(",").some((sel) => /^\.avatar-card/.test(sel.trim())) && /(^|;|\s)(transform|translate|scale|rotate|filter|backdrop-filter|will-change|contain)\s*:/.test(r.body), r.selector).toBe(false);
    // and nothing of it is an ancestor of the widget: the widget is a child of the action area, the orb button its sibling (see the DOM test)
    expect(css).not.toMatch(/\.call-orb[^{]*hanc-ai/);
  });

  it("the other icons keep their pill: the plate and the example stand above it", () => {
    expect(body('.avatar-card:not([data-icon="orb"]) .avatar-card__plate')).toMatch(/bottom: calc\(var\(--space-2\) \+ 3\.1rem\)/);
  });

  it("the widget hides behind the button on the large card too, with its own parts only", () => {
    const sel = '.avatar-card[data-placement="hero"]:has(.avatar-card__start:not([data-mode="standard"])) hanc-ai-pill-floating-call';
    const parts = all.find((r) => r.media === "" && r.selector.includes(`${sel}::part(pill-button)`))!;
    expect(parts.body.replace(/\s+/g, " ").trim()).toBe("visibility: hidden; transition: none;");
    expect(body(sel)).toMatch(/overflow: hidden/);
  });
});

describe("the circle: the docked orb card on a phone is only the round button", () => {
  const CIRCLE = "@media (width < 40em), (height < 32.5em)";
  const DOCK = '.avatar-card[data-icon="orb"][data-placement="dock"]';

  it("is the 7.25em dock fixed 16px from the window's lower right, the safe area respected, with no frame (no picture, no plate)", () => {
    const c = body(DOCK, CIRCLE);
    expect(c).toMatch(/right: max\(var\(--space-3\), env\(safe-area-inset-right\)\)/);
    expect(c).toMatch(/bottom: max\(var\(--space-3\), env\(safe-area-inset-bottom\)\)/);
    expect(c).toMatch(/width: 7\.25em/);
    expect(c).toMatch(/height: 7\.25em/);
    expect(c).toMatch(/aspect-ratio: auto/);
    expect(body(`${DOCK} .avatar-card__frame`, CIRCLE)).toMatch(/display: none/);
    expect(body(`${DOCK} .call-orb`, CIRCLE)).toMatch(/display: block/);
    expect(body(`${DOCK} .avatar-card__action`, CIRCLE)).toMatch(/inset: 0/);
    expect(body(".avatar-card")).toMatch(/position: fixed/); // still the fixed card
  });

  it("the footer reserves the circle's size, not the picture's, while the card is docked", () => {
    const root = body(":root:has(.avatar-card[data-icon=\"orb\"][data-placement=\"dock\"])", CIRCLE);
    expect(root).toMatch(/--avatar-card-h: 6\.5rem/);
    expect(root).toMatch(/--avatar-card-bottom: var\(--space-3, 1rem\)/);
  });

  it("the widget hides behind the circle with its own parts only (visibility and no transition), as on the large card", () => {
    const sel = `${DOCK}:has(.avatar-card__start:not([data-mode="standard"])) hanc-ai-pill-floating-call`;
    const parts = all.find((r) => r.media === CIRCLE && r.selector.includes(`${sel}::part(pill-button)`))!;
    expect(parts.body.replace(/\s+/g, " ").trim()).toBe("visibility: hidden; transition: none;");
    expect(body(sel, CIRCLE)).toMatch(/overflow: hidden/);
  });

  it("the other icons keep the picture and the widget's own small round button on a phone", () => {
    expect(body('.avatar-card[data-placement="dock"] .avatar-card__action', "@media (22.5em <= width < 40em) and (height >= 32.5em)")).toMatch(/justify-content: flex-end/);
    // the circle rules above all name data-icon="orb": nothing in them reaches the dot or the wheel
    expect(all.filter((r) => r.media === CIRCLE && /avatar-card\[data-icon="orb"\]/.test(r.selector) === false && /\.avatar-card__frame|\.call-orb/.test(r.selector))).toEqual([]);
  });
});

describe("the example call looks like Hanc's (RoleHero.astro)", () => {
  it("the block: 1.25em from the sides, 8.4em above the foot, the stage ink", () => {
    const c = body(".avatar-card__captions");
    expect(c).toMatch(/left: 1\.25em/);
    expect(c).toMatch(/right: 1\.25em/);
    expect(c).toMatch(/bottom: 8\.4em/);
    expect(c).toMatch(/color: var\(--avatar-ink, white\)/);
  });

  it("the header: 0.75em, 600, 0.02em tracking, muted, 0.6em above the lines; four 3px bars, 2px radius, 30% high at rest, the ring gradient", () => {
    const h = body(".avatar-card__cap-head");
    expect(h).toMatch(/font-size: 0\.75em/);
    expect(h).toMatch(/font-weight: 600/);
    expect(h).toMatch(/letter-spacing: 0\.02em/);
    expect(h).toMatch(/margin: 0 0 0\.6em/);
    expect(h).toMatch(/color: color-mix\(in srgb, var\(--avatar-ink, white\) 70%, var\(--avatar-stage, black\)\)/);
    const bar = body(".avatar-card__bars i");
    expect(bar).toMatch(/width: 3px/);
    expect(bar).toMatch(/border-radius: 2px/);
    expect(bar).toMatch(/height: 30%/);
    expect(bar).toMatch(/background: var\(--avatar-ring, /);
    expect(body(".avatar-card__bars")).toMatch(/gap: 2px/);
  });

  it("the lines: 0.9375em / 1.35 in the ink, 0.45em apart; the name is bold with 0.35em after it, the caller's name muted; the line before the newest is at half strength; words fade from 0.18 in 160ms", () => {
    expect(body(".avatar-card__line")).toMatch(/font-size: 0\.9375em/);
    expect(body(".avatar-card__line")).toMatch(/line-height: 1\.35/);
    expect(body(".avatar-card__line")).toMatch(/color: var\(--avatar-ink, white\)/);
    expect(body(".avatar-card__lines")).toMatch(/gap: 0\.45em/);
    expect(body(".avatar-card__who")).toMatch(/font-weight: 700/);
    expect(body(".avatar-card__who")).toMatch(/margin-right: 0\.35em/);
    expect(body('.avatar-card__line[data-who="caller"] .avatar-card__who')).toMatch(/color: color-mix\(in srgb, var\(--avatar-ink, white\) 70%/);
    expect(body(".avatar-card__captions[data-live] .avatar-card__line[data-past]")).toMatch(/opacity: 0\.5/);
    expect(body(".avatar-card__captions[data-live] [data-w]")).toMatch(/opacity: 0\.18/);
    expect(body(".avatar-card__captions[data-live] [data-w]")).toMatch(/transition: opacity 160ms/);
  });

  it("two lines are visible while it runs and while it is still (no script, reduced motion)", () => {
    expect(body(".avatar-card__line:nth-child(n + 3)")).toMatch(/display: none/);
    expect(body(".avatar-card__captions[data-live] .avatar-card__line")).toMatch(/display: none/);
    expect(body(".avatar-card__captions[data-live] .avatar-card__line[data-on]")).toMatch(/display: block/);
  });
});

describe("the hero placement", () => {
  it("the card is absolute in document coordinates at the slot's place and width, with the geometry from the placement hook", () => {
    const hero = body('.avatar-card[data-placement="hero"]');
    expect(hero).toMatch(/position: absolute/);
    expect(hero).toMatch(/top: var\(--avatar-slot-y, 0\)/);
    expect(hero).toMatch(/left: var\(--avatar-slot-x, 0\)/);
    expect(hero).toMatch(/width: var\(--avatar-slot-w, 12\.5rem\)/);
    expect(hero).toMatch(/right: auto/);
    expect(hero).toMatch(/bottom: auto/);
    expect(body(".avatar-card")).toMatch(/position: fixed/); // docked: as before
  });

  it("no ancestor of the card is positioned (the initial containing block is the reference), and none is transformed", () => {
    const hits = all
      .filter((r) => r.selector.split(",").some((s) => [".pt", "body", "html", "main"].includes(s.trim()) || /^\.pt-[a-z-]+$/.test(s.trim())))
      .filter((r) => /(^|;|\s)position\s*:/.test(r.body))
      .map((r) => `${r.media} ${r.selector}`);
    expect(hits).toEqual([]);
  });

  it("hides the card until its first measurement, with visibility only (never opacity, display or pointer-events: the widget is inside)", () => {
    expect(body('.avatar-card[data-ready="false"]')).toMatch(/^\s*visibility: hidden;\s*$/);
  });

  it("the hero's own stacking context does not hold the card: it is a sibling of <main>, the CSS file never puts a z-index on .pt or main", () => {
    expect(all.filter((r) => [".pt", "main"].includes(r.selector) && /z-index/.test(r.body))).toEqual([]);
  });
});
