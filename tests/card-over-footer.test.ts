// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { footerVersionLine } from "@/components/Footer";

// happy-dom cannot measure layout: these tests read the source and the CSS and do the footer's arithmetic. The real measurement (the footer's links against the card's box,
// at 1280 / 1366 / 1440 / 1920, DE and BG, light and dark) was made in a browser (see the commit message).
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
const css = read("src", "app", "globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

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

describe("the docked card does not move near the footer", () => {
  it("the footer-cap script is gone and nothing in the source sets a lift on the card", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src", "components", "use-card-footer-cap.ts"))).toBe(false);
    expect(read("src", "components", "AgentAvatarCard.tsx")).not.toMatch(/FooterCap|footer-cap/);
    expect(css).not.toContain("--avatar-card-lift");
  });

  it("the docked card has its one fixed place: right and bottom from the corner, in every window", () => {
    const card = body(".avatar-card");
    expect(card).toMatch(/position: fixed/);
    expect(card).toMatch(/right: var\(--space-3\)/);
    expect(card).toMatch(/bottom: var\(--avatar-card-bottom, 6rem\)/);
    // no rule of the dock computes its `bottom` (the cap added a variable to it): every `bottom` of the dock is a plain corner value
    const dockBottoms = all.filter((r) => /avatar-card\[data-placement="dock"\]$/.test(r.selector)).flatMap((r) => /(?:^|[;\s])bottom:\s*([^;]+)/.exec(r.body)?.[1] ?? []);
    for (const v of dockBottoms) expect(v).toMatch(/^(var\(--[a-z0-9-]+(, [^)]+)?\)|0|[\d.]+(px|rem))$/);
  });
});

describe("the footer's content is not under the docked card", () => {
  const DOCK = "@media (width >= 56.25em) and (height >= 32.5em)"; // the corner card; below 56.25em the call bar
  const padding = body(".site-footer--agent-card .site-footer__inner", DOCK);

  it("has a right padding on the card's windows, from the card's width variable", () => {
    expect(padding).toMatch(/padding-right: max\(var\(--space-4\), calc\(var\(--avatar-card-w, 12\.5rem\) \+ 2 \* var\(--space-3\) - max\(0rem, \(100% - var\(--container-wide, var\(--container\)\)\) \/ 2\)\)\)/);
  });

  it("leaves room beside the card at every desktop width: the content ends at least a gap left of the card's edge", () => {
    // the values of the bundled themes: --space-3 16px, --space-4 24px, --container-wide 1280px; the card is 200px wide (12.5rem)
    const SPACE3 = 16, SPACE4 = 24, WIDE_BOX = 1280, CARD = 200;
    const rightPadding = (vw: number) => Math.max(SPACE4, CARD + 2 * SPACE3 - Math.max(0, (vw - WIDE_BOX) / 2));
    for (const vw of [1280, 1366, 1440, 1920]) {
      const contentEdgeFromRight = Math.max(0, (vw - WIDE_BOX) / 2) + rightPadding(vw); // the content's right edge, measured from the window's right edge
      const cardLeftFromRight = SPACE3 + CARD;
      expect(contentEdgeFromRight, `at ${vw}px`).toBeGreaterThanOrEqual(cardLeftFromRight + SPACE3);
    }
    // a wide window needs nothing extra: the container's margin is enough
    expect(rightPadding(1920)).toBe(SPACE4);
  });

  it("only on the card's windows: the phone's call bar and the tiny circle keep the room below the last line instead", () => {
    expect(body(".site-footer--agent-card .site-footer__inner")).toBe("");
    expect(body(".site-footer--agent-card .site-footer__inner", "@media (width >= 40em) and (height >= 32.5em)")).toBe("");
    expect(body(".site-footer--agent-card")).toMatch(/padding-bottom: calc\(var\(--space-5\) \+ var\(--avatar-card-h, 15\.625rem\) \+ var\(--avatar-card-bottom, 6rem\)\)/);
  });
});

describe("the version line", () => {
  const info = { version: "0.9.0", template: "abc1234", content: "def5678", built: "2026-11-04 10:00" };
  it("is the full line in a demo and in development", () => {
    expect(footerVersionLine(info, false)).toContain("template abc1234");
  });
  it("is the version only in a release", () => {
    expect(footerVersionLine(info, true)).toBe("v0.9.0");
  });
});
