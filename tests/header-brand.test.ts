// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// happy-dom cannot measure layout: these tests read the CSS and do the row's arithmetic with numbers measured in a browser (the header at 320 to 1920 px, light and dark,
// all four page languages: see the commit message). The real measurement is what found the wrap; the numbers below are what it measured.
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
const raw = read("src", "app", "globals.css");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

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

describe("the brand name is one line", () => {
  it("never wraps and is never broken inside a word: nowrap, no wrap-anywhere, no hyphens", () => {
    const name = body(".site-header__name");
    expect(name).toMatch(/white-space:\s*nowrap/);
    expect(name).not.toMatch(/overflow-wrap:\s*anywhere|hyphens:\s*auto|word-break/);
    // and it is not in the list of text that may break anywhere (the first rule of the file's long-word group)
    const group = all.find((r) => r.selector.split(",").some((s) => s.trim() === ".offer__disclaimer"));
    expect(group?.selector).not.toContain(".site-header__name");
  });

  it("a name that does not fit at all ends in an ellipsis instead of widening the page", () => {
    const name = body(".site-header__name");
    expect(name).toMatch(/overflow:\s*hidden/);
    expect(name).toMatch(/text-overflow:\s*ellipsis/);
    expect(name).toMatch(/min-width:\s*0/);
  });

  it("on a phone the brand is no longer a flex item that may shrink to nothing (it was `1 1 0`: that is what wrapped it)", () => {
    const phone = body(".site-header:not(.site-header--agent) .site-header__brand", "@media (width < 56.25em)");
    expect(phone).not.toMatch(/flex:\s*1 1 0/);
    expect(phone).toMatch(/flex:\s*0 1 auto/);
  });

  it("the mark and the name take their size from --brand-now, with fallbacks everywhere, so the footer's copy of the markup keeps its size", () => {
    expect(body(".site-header__brand")).toMatch(/--brand-now:\s*max\(0\.9rem, min\(var\(--brand-size, 1\.7rem\), var\(--brand-fit, 99rem\)\)\)/);
    expect(body(".site-header__name")).toContain("font-size: var(--brand-now, 1.7rem)");
    expect(body(".site-header__logo svg")).toContain("calc(var(--brand-now, 1.7rem) * 1.15)");
    // --brand-fit is only ever set on the header (never on :root or the footer), so nothing outside the header shrinks
    const setters = all.filter((r) => /--brand-fit\s*:/.test(r.body)).map((r) => r.selector);
    expect(setters.length).toBeGreaterThan(0);
    for (const s of setters) expect(s, s).toMatch(/^\.site-header:not\(\.site-header--agent\)$/);
    expect(css).not.toMatch(/\.site-footer[^{]*--brand-fit/);
  });
});

describe("the controls give way before the name does", () => {
  const H = ".site-header:not(.site-header--agent)";
  it("below 30em the language button loses its arrow and most of its padding", () => {
    const m = "@media (width < 30em)";
    expect(body(`${H} .lang-menu__current::after`, m)).toMatch(/display:\s*none/);
    expect(body(`${H} .lang-menu__current`, m)).toMatch(/padding-inline:\s*var\(--space-1\)/);
  });

  it("below 22.5em it is the globe alone (the summary keeps its aria-label, so it still has a name)", () => {
    const m = "@media (width < 22.5em)";
    expect(body(`${H} .lang-menu__current-code`, m)).toMatch(/display:\s*none/);
    expect(body(`${H} .lang-menu__current`, m)).toMatch(/width:\s*var\(--header-control-h, 2\.75rem\)/);
    expect(read("src", "components", "LanguageSwitcher.tsx")).toContain("aria-label={`${title}: ${currentName}`}");
  });

  it("only below 25em does the brand get smaller, and the side padding changes only below 21em", () => {
    expect(body(H, "@media (width < 25em)")).toContain("--brand-fit: calc((100vw - 13.5rem) / 6.25)");
    expect(body(H, "@media (width < 22.5em)")).toContain("--brand-fit: calc((100vw - 13rem) / 6.25)");
    expect(body(H, "@media (width < 21em)")).toContain("--brand-fit: calc((100vw - 12rem) / 6.25)");
    expect(body(`${H} .site-header__inner`, "@media (width < 21em)")).toMatch(/padding-inline:\s*var\(--space-3\)/);
    // from 25em up nothing sets it: the theme's size
    for (const r of all.filter((x) => /--brand-fit\s*:/.test(x.body))) expect(r.media, r.selector).toMatch(/width < (25|22\.5|21)em/);
  });

  it("every compact-control rule is in a phone media query, so the tablet and desktop header is as it was", () => {
    const compact = all.filter((r) => r.selector.startsWith(`${H} .lang-menu__current`) || (r.selector === H && /--brand-fit/.test(r.body)) || r.selector === `${H} .site-header__inner`);
    expect(compact.length).toBeGreaterThan(4);
    for (const r of compact) {
      if (r.media === "@media (width < 56.25em)") continue; // the header's older phone block (the one-row layout)
      expect(r.media, r.selector).toMatch(/^@media \(width < (30|25|22\.5|21)em\)$/);
    }
  });
});

describe("the row has room: the brand, the controls, the paddings and the gap add up to the window, 320 to 480 px wide", () => {
  // Measured in a browser (the root font size is 18px; a classic 15px scrollbar is assumed, which a phone does not have, so this is the harsher case).
  const MQ = 16; // an em in a media query is the browser's 16px, not the page's root size
  const REM = 18, SCROLLBAR = 15, GAP = 8, BRAND_GAP = 4, END_GAP = 4;
  const TOOLS = 99; // theme toggle + music: two 2.75rem squares and the divider
  const NAME_EM = { light: 5.31, dark: 4.49 }; // the name's width over its font size: Source Serif 4 (light), Cormorant Garamond (dark)
  const THEME_SIZE = { light: 1.35, dark: 1.275 }; // --brand-size on a phone, in rem
  const LOGO_EM = 0.95; // the mark's width over the name's font size
  const lang = (w: number) => (w < 22.5 * MQ ? 2.75 * REM : w < 30 * MQ ? 55 : 63);
  const fit = (w: number) => {
    const k = w < 21 * MQ ? 12 : w < 22.5 * MQ ? 13 : w < 25 * MQ ? 13.5 : null;
    return k === null ? Infinity : (w - k * REM) / 6.25; // px
  };
  const size = (w: number, theme: "light" | "dark") => Math.max(0.9 * REM, Math.min(THEME_SIZE[theme] * REM, fit(w)));
  const pad = (w: number) => (w < 21 * MQ ? 16 : 24);

  for (const theme of ["light", "dark"] as const) {
    for (const w of [320, 336, 340, 359, 360, 368, 375, 390, 412, 430, 480]) {
      it(`${theme}, ${w}px: name, mark, controls and padding fit in one row`, () => {
        const fs = size(w, theme);
        const brand = LOGO_EM * fs + BRAND_GAP + NAME_EM[theme] * fs;
        const used = 2 * pad(w) + brand + GAP + lang(w) + END_GAP + TOOLS;
        expect(used, `needs ${Math.round(used)}px of ${w - SCROLLBAR}px`).toBeLessThanOrEqual(w - SCROLLBAR + 2);
      });
    }
  }

  it("the language code is kept from 360px up and the globe alone shows below it", () => {
    expect(lang(360)).toBe(55);
    expect(lang(359)).toBe(2.75 * REM);
    expect(lang(430)).toBe(55); // the compact button (code, no arrow) up to 480px
    expect(lang(500)).toBe(63); // the full button above it
  });

  it("the name stays at least 0.9rem, and at 390px and wider it is within 5% of the theme's size", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const w of [320, 360]) expect(size(w, theme)).toBeGreaterThanOrEqual(0.9 * REM);
      expect(size(390, theme)).toBeGreaterThanOrEqual(THEME_SIZE[theme] * REM * 0.95);
      expect(size(430, theme)).toBe(THEME_SIZE[theme] * REM);
    }
  });
});
