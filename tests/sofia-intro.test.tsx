// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { SofiaIntro } from "@/components/SofiaIntro";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

vi.mock("hanc-webrtc-widgets", () => ({}));

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const BASE: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en", "de"], example: null, liveText: null, dark: null };
const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };
const site = (lang: "en" | "de", intro: ResolvedAvatar["intro"]) => {
  const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  return { ...s, seller: { ...s.seller, agent } as any, avatar: { ...BASE, intro } };
};
const ITEMS = [
  { en: "Questions about the car", de: "Fragen zum Auto" },
  { en: "Book a test drive", de: "Probefahrt buchen" },
  { en: "Callback", de: "Rückruf" },
];

describe("SofiaIntro", () => {
  it("shows the standard question of the page language when the content has no heading, and no running line without items", () => {
    expect(renderToStaticMarkup(<SofiaIntro site={site("en", null) as any} />)).toBe('<div class="sofia-intro"><p class="sofia-intro__heading">Rather talk than read?</p></div>');
    expect(renderToStaticMarkup(<SofiaIntro site={site("de", { heading: null, items: [] }) as any} />)).toContain("Lieber reden als lesen?");
  });

  it("takes the heading and the items from the content, in the page language", () => {
    const en = renderToStaticMarkup(<SofiaIntro site={site("en", { heading: { en: "Talk to me", de: "Sprechen Sie mit mir" }, items: ITEMS }) as any} />);
    expect(en).toContain(">Talk to me</p>");
    expect(en).toContain("<li>Book a test drive</li>");
    const de = renderToStaticMarkup(<SofiaIntro site={site("de", { heading: { en: "Talk to me", de: "Sprechen Sie mit mir" }, items: ITEMS }) as any} />);
    expect(de).toContain(">Sprechen Sie mit mir</p>");
    expect(de).toContain("<li>Probefahrt buchen</li>");
    expect(de).not.toContain("Book a test drive");
  });

  it("is a chain: two identical tracks, each with at least 10 items (the list is repeated), the loop's speed set per pass over the list", () => {
    const out = renderToStaticMarkup(<SofiaIntro site={site("en", { heading: null, items: ITEMS }) as any} />);
    const tracks: string[] = out.match(/<ul [^>]*>[\s\S]*?<\/ul>/g) ?? [];
    expect(tracks).toHaveLength(2);
    const texts = (t: string) => [...t.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((m) => m[1]);
    expect(texts(tracks[0])).toEqual(texts(tracks[1]));
    expect(texts(tracks[0]).length).toBeGreaterThanOrEqual(10);
    expect(texts(tracks[0]).slice(0, 3)).toEqual(["Questions about the car", "Book a test drive", "Callback"]);
    expect(out).toContain("--sofia-loop:160s"); // 4 passes over the list x 40 s: the same speed as one pass
  });

  it("has the list once for a screen reader: the first pass of the first track is labelled, every repeat and the second track are aria-hidden", () => {
    const out = renderToStaticMarkup(<SofiaIntro site={site("en", { heading: null, items: ITEMS }) as any} />);
    const [first = "", second = ""] = out.match(/<ul [^>]*>[\s\S]*?<\/ul>/g) ?? [];
    expect(first).toContain('aria-label="Things Sofia can do"');
    expect(first.split("</ul>")[0].match(/<ul [^>]*>/)![0]).not.toContain("aria-hidden");
    expect(second.match(/<ul [^>]*>/)![0]).toContain('aria-hidden="true"');
    const lis = [...first.matchAll(/<li([^>]*)>/g)].map((m) => m[1].includes("aria-hidden"));
    expect(lis.slice(0, 3)).toEqual([false, false, false]);
    expect(lis.slice(3).every(Boolean)).toBe(true);
    expect(out).not.toMatch(/<button|<a |tabindex/); // plain text: no chips, nothing to focus
  });

  it("sits in the hero above the card's slot, only with a card", () => {
    const s = site("en", { heading: null, items: ITEMS });
    const out = renderToStaticMarkup(<ProductLayout site={s as any} />);
    const top = /<div class="hero__top hero__container">([\s\S]*?)<\/div><\/div><\/div><div class="hero__intro">/.exec(out)?.[1] ?? "";
    expect(top).toContain('<div class="hero__aside">');
    expect(top.indexOf("sofia-intro")).toBeGreaterThan(top.indexOf("hero__stage"));
    expect(top.indexOf("sofia-intro")).toBeLessThan(top.indexOf("data-agent-slot"));
    const none = renderToStaticMarkup(<ProductLayout site={{ ...s, seller: { ...s.seller, agent: undefined }, avatar: null } as any} />);
    expect(none).not.toContain("sofia-intro");
  });
});

describe("the running line (CSS contract)", () => {
  const body = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("moves the rail by exactly one track, linear, forever, with no script, and never pauses", () => {
    expect(body(".sofia-intro__rail")).toMatch(/animation:\s*sofia-intro-run var\(--sofia-loop, 40s\) linear infinite/);
    expect(/@keyframes sofia-intro-run\s*\{\s*to\s*\{\s*transform:\s*translateX\(-50%\)/.test(css)).toBe(true);
    expect(body(".sofia-intro__rail")).toMatch(/width:\s*max-content/);
    expect(body(".sofia-intro__items")).toMatch(/flex:\s*none/);
    expect(body(".sofia-intro__rail")).not.toMatch(/play-state/);
    expect(css).not.toMatch(/\.sofia-intro[^{]*:(hover|active|focus-within)/);
  });

  it("under reduced motion: no animation, one wrapped static line, the copy hidden", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sofia-intro__rail[\s\S]*?\n\}\n/.exec(css)?.[0] ?? "";
    expect(block).toMatch(/\.sofia-intro__rail\s*\{[^}]*animation:\s*none/);
    expect(block).toMatch(/\.sofia-intro__items\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(block).toMatch(/\.sofia-intro__items\[aria-hidden="true"\],\s*\.sofia-intro__items li\[aria-hidden="true"\]\s*\{\s*display:\s*none/);
  });

  it("is not a chip: no border, background or radius on the items", () => {
    for (const sel of [".sofia-intro__items", ".sofia-intro__items li::after"]) expect(body(sel), sel).not.toMatch(/border|background|radius/);
  });

  it("is an item of the hero's column on a phone and the top of the right column from 56em, and never sets anything the card's overlay could be confined by", () => {
    expect(body(".hero__aside")).toMatch(/display:\s*contents/);
    expect(/@media \(width < 56em\)\s*\{\s*\.sofia-intro\s*\{[^}]*order:\s*5/.test(css)).toBe(true);
    expect(/@media \(min-width: 56em\)\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\.hero__aside\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/.test(css)).toBe(true);
    for (const sel of [".sofia-intro", ".sofia-intro__marquee"]) expect(body(sel), sel).toMatch(/width:\s*0;[\s\S]*min-width:\s*100%/); // it never widens the card's column
    expect(body(".sofia-intro")).toMatch(/overflow:\s*hidden/);
    for (const sel of [".sofia-intro", ".sofia-intro__marquee", ".sofia-intro__items"]) expect(body(sel), sel).not.toMatch(/transform|filter|perspective|contain|will-change/);
  });

  it("on wide screens it hangs over the column (absolute, no height of its own in the column) in a lead-in band made tall enough for it", () => {
    expect(css).toMatch(/\.sofia-intro\s*\{\s*position:\s*absolute;\s*inset:\s*auto 0 calc\(100% \+ var\(--space-2\)\)/);
    expect(css).toMatch(/\.hero\[data-card\] \.hero__lead-in\s*\{[^}]*min-height:\s*3\.4rem/);
    expect(css).toMatch(/\.hero__aside \.sofia-intro__heading\s*\{\s*font-size:\s*1\.1rem/);
  });
});
