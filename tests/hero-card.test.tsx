// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

vi.mock("hanc-webrtc-widgets", () => ({}));

const AVATAR: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en"], example: null, liveText: null };
const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };
const html = (withCard: boolean) => {
  const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
  return renderToStaticMarkup(<ProductLayout site={{ ...s, seller: { ...s.seller, agent: withCard ? agent : undefined } as any, avatar: withCard ? AVATAR : null }} />);
};
const heroOf = (out: string) => /<section class="hero"[\s\S]*?<div class="hero__intro">/.exec(out)?.[0] ?? "";

describe("the hero with the agent's card", () => {
  it("has the title zone and a slot in one row, the slot after the photo and before the bottom row, aria-hidden and empty", () => {
    const hero = heroOf(html(true));
    expect(hero).toContain('data-card="true"');
    const top = /<div class="hero__top hero__container">([\s\S]*)<div class="hero__slot" data-agent-slot="true" aria-hidden="true"><\/div><\/div>/.exec(hero)?.[1] ?? "";
    expect(top).toContain('<div class="hero__stage">');
    expect(top.indexOf("<h1")).toBeLessThan(top.indexOf("hero__photo"));
    // the eyebrow is above the row, in its own centred band; the row has only the headline and the photo
    expect(top).not.toContain("hero__eyebrow");
    expect(hero).toMatch(/<div class="hero__lead-in hero__container"><p class="hero__eyebrow label">[^<]+<\/p><\/div><div class="hero__top/);
    expect(hero.match(/data-agent-slot/g)).toHaveLength(1);
    expect(hero.match(/<h1/g)).toHaveLength(1);
  });

  it("moves only the title and the photo: the price, the facts and the buttons stay in the bottom row", () => {
    const out = html(true);
    const top = /<div class="hero__top[\s\S]*?data-agent-slot/.exec(out)?.[0] ?? "";
    for (const part of ["hero__figure", "hero__facts", "hero__actions", "hero__description"]) expect(top, part).not.toContain(part);
    expect(out.indexOf("data-agent-slot")).toBeLessThan(out.indexOf("hero__intro"));
    for (const part of ["hero__figure", "hero__actions"]) expect(out).toContain(part);
  });

  it("is the same page without a card as before: no wrapper, no slot", () => {
    const out = html(false);
    expect(out).toContain('<div class="hero__stage hero__container">');
    expect(out).not.toMatch(/hero__top|hero__slot|data-card|avatar-card/);
  });

  it("renders the card itself once, outside the hero (not inside the slot)", () => {
    const out = html(true);
    expect(out.match(/class="avatar-card"/g)).toHaveLength(1);
    expect(/<div class="hero__slot"[^>]*><\/div>/.test(out)).toBe(true);
    expect(heroOf(out)).not.toContain("avatar-card");
    expect(out).toMatch(/<section class="avatar-card" data-block="agent" data-placement="hero" data-ready="false"/); // the server's guess: the hero is there
  });
});

describe("the hero's CSS with the card", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  /** The declarations of `selector` inside a (non-nested-deeper) @media block with this prelude, or at the top level when media is "". */
  const block = (selector: string, media: string) => {
    const re = new RegExp(`(^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
    if (!media) return re.exec(css)?.[2] ?? "";
    for (let at = css.indexOf(`@media ${media} {`); at >= 0; at = css.indexOf(`@media ${media} {`, at + 1)) {
      const found = re.exec(css.slice(at, css.indexOf("\n}\n", at)));
      if (found) return found[2];
    }
    return "";
  };

  it("the slot is 4:5 and a block under the photo: 15.5rem wide on a phone (one variable), 27rem from 40em", () => {
    const slot = block(".hero__slot", "");
    expect(slot).toMatch(/width: min\(100%, var\(--avatar-hero-card-w, 15\.5rem\)\)/);
    expect(slot).toMatch(/aspect-ratio: 4 \/ 5/);
    expect(slot).toMatch(/margin: var\(--space-5\) auto var\(--space-5\)/);
    expect(block(".hero__slot", "(min-width: 40em)")).toMatch(/width: min\(100%, 27rem\)/);
  });

  it("from 56em the title and the photo are the left column, left-aligned, and the slot the right one, at most 36rem and 44vw", () => {
    const wide = "(min-width: 56em)";
    expect(block(".hero__top", wide)).toMatch(/grid-template-columns: minmax\(0, 1fr\) auto/);
    expect(block(".hero__top", wide)).toMatch(/align-items: start/);
    expect(block(".hero__top .hero__stage", wide)).toMatch(/text-align: left/);
    expect(block(".hero__top .hero__stage", wide)).toMatch(/align-items: flex-start/);
    expect(block(".hero__slot", wide)).toMatch(/width: min\(36rem, 44vw\)/);
  });

  it("the eyebrow keeps its place above the row, centred; the row starts with the headline (no padding, no top margin)", () => {
    expect(block(".hero__lead-in", "")).toMatch(/text-align: center/);
    expect(block(".hero__top .hero__stage", "")).toMatch(/padding: 0/);
    expect(block(".hero__top .hero__headline", "")).toMatch(/margin-top: 0/);
  });

  it("in the one-screen hero the slot is as tall as the left column (its top is the headline's top, its bottom the photo's bottom) and 4:5 wide, with no container query", () => {
    const one = "(min-width: 56em) and (min-height: 37.5em)";
    const slot = block(".hero__slot", one);
    expect(slot).toMatch(/align-self: stretch/);
    expect(slot).toMatch(/width: min\(36rem, 44vw, calc\(var\(--hero-slot-h, 100vh\) \* 0\.8\)\)/); // 4:5 of the row's height, the script hands that over
    expect(slot).toMatch(/min-width: 18rem/);
    expect(slot).toMatch(/aspect-ratio: auto/); // the slot's height is the row's: it must not push the row up
    expect(block(".hero__top", one)).toMatch(/flex: 1/);
    expect(block(".hero__top .hero__photo", one)).toMatch(/margin-bottom: 0/); // the photo ends where the row ends
    expect(css).not.toMatch(/container-type|\bcq[wh]\b|\d\s*cq[wh]/);
  });

  it("the photo and the card end one step of the spacing scale (space-5) above the divider of the bottom row, so neither touches it and the card's shadow has faded", () => {
    expect(block(".hero__top", "(min-width: 56em) and (min-height: 37.5em)")).toMatch(/margin-bottom: var\(--space-5\)/);
  });

  it("with the card the compact bottom row keeps the trust line, which the first screen shows", () => {
    expect(block(".hero[data-card] .hero__trust", "(min-width: 56em) and (min-height: 37.5em) and (max-height: 50em)")).toMatch(/display: flex/);
  });

  it("keeps the bottom row below, full width: nothing of it is in the grid", () => {
    expect(css).not.toMatch(/\.hero__intro[^{]*\{[^}]*grid-column/);
  });
});
