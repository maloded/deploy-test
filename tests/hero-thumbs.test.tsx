// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroThumbs } from "@/components/HeroThumbs";
import ProductLayout from "@/components/ProductLayout";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { HERO_THUMB_MIN_REM, heroThumbs } from "@/lib/hero-thumbs";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const slide = (n: number) => ({ src: `/p${n}.jpg`, width: 800, height: 600, alt: `Photo ${n}`, position: n === 3 ? "30% 40%" : undefined });
const SLIDES = [1, 2, 3, 4, 5].map(slide);

describe("which photos the thumbnails are", () => {
  it("are the next two gallery photos after the hero one, numbered as in #gallery-N (1-based), with their own alt texts", () => {
    expect(heroThumbs(SLIDES, "/p1.jpg").map((t) => [t.n, t.src, t.alt])).toEqual([[2, "/p2.jpg", "Photo 2"], [3, "/p3.jpg", "Photo 3"]]);
    expect(heroThumbs(SLIDES, "/p3.jpg").map((t) => t.n)).toEqual([4, 5]);
    expect(heroThumbs(SLIDES, "/p3.jpg")[0].position).toBeUndefined();
    expect(heroThumbs(SLIDES, "/p2.jpg")[0].position).toBe("30% 40%");
  });
  it("are the first two when the hero photo is not in the gallery, and fewer when the gallery has fewer left", () => {
    expect(heroThumbs(SLIDES, "/other.jpg").map((t) => t.n)).toEqual([1, 2]);
    expect(heroThumbs(SLIDES, undefined).map((t) => t.n)).toEqual([1, 2]);
    expect(heroThumbs(SLIDES, "/p4.jpg").map((t) => t.n)).toEqual([5]);
    expect(heroThumbs(SLIDES, "/p5.jpg")).toEqual([]);
    expect(heroThumbs([], "/p1.jpg")).toEqual([]);
  });
});

describe("the thumbnails in the hero", () => {
  const AVATAR: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en"], example: null, liveText: null };
  const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };
  const html = (opts: { card?: boolean; blocks?: (s: string) => boolean } = {}) => {
    const card = opts.card ?? true;
    const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    const blocks = opts.blocks ? s.blocks.filter(opts.blocks) : s.blocks;
    return renderToStaticMarkup(<ProductLayout site={{ ...s, blocks, seller: { ...s.seller, agent: card ? agent : undefined } as any, avatar: card ? AVATAR : null }} />);
  };
  const heroOf = (out: string) => /<section class="hero"[\s\S]*?<div class="hero__intro">/.exec(out)?.[0] ?? "";

  it("are links to the gallery at that photo, with the photo's real alt text, inside the photo's zone", () => {
    const hero = heroOf(html());
    const links = [...hero.matchAll(/<a class="hero__thumb" href="#gallery-(\d+)"><img[^>]*alt="([^"]*)"/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([["1", "Fixture photo one"], ["2", "Fixture photo two"]]); // the fixture's hero photo is not in its gallery: the first two
    expect(hero).toMatch(/<div class="hero__photo"[^>]*data-thumbs="2"[\s\S]*<div class="hero__thumbs">/);
    expect(hero.indexOf("hero__frame")).toBeLessThan(hero.indexOf("hero__thumbs")); // the column is right of the photo
    expect(hero.indexOf("hero__thumbs")).toBeLessThan(hero.indexOf("data-agent-slot"));
  });
  it("are not there without the card (that hero is as it was) or when the page has no gallery", () => {
    expect(heroOf(html({ card: false }))).not.toMatch(/hero__thumb|data-thumbs/);
    expect(heroOf(html({ blocks: (b) => b !== "gallery" }))).not.toMatch(/hero__thumb|data-thumbs/);
  });
  it("are in the page language", () => {
    const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "de");
    const out = renderToStaticMarkup(<ProductLayout site={{ ...s, seller: { ...s.seller, agent } as any, avatar: AVATAR }} />);
    expect(heroOf(out)).toContain('alt="Testfoto eins"');
  });
});

describe("the column measures its room", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let width = 0;
  let ro: (() => void)[] = [];
  const mount = async () => {
    (window as any).ResizeObserver = class {
      constructor(cb: () => void) {
        ro.push(cb);
      }
      observe() {}
      disconnect() {}
    };
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: this.classList?.contains("hero__thumbs") ? width : 0, height: 100, right: width, bottom: 100, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<HeroThumbs><a className="hero__thumb" href="#gallery-2">x</a></HeroThumbs>));
  };
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    ro = [];
  });
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  it("renders the thumbnails where there is room for them, and none where there is less than the minimum (they cannot be tabbed to either)", async () => {
    width = HERO_THUMB_MIN_REM * rem() + 1;
    await mount();
    expect(document.querySelectorAll(".hero__thumb")).toHaveLength(1);
    width = HERO_THUMB_MIN_REM * rem() - 1; // the window got narrower
    act(() => ro.forEach((cb) => cb()));
    expect(document.querySelectorAll(".hero__thumb")).toHaveLength(0);
    expect(document.querySelector(".hero__thumbs")).not.toBeNull(); // the column itself stays: it measures
    width = 400;
    act(() => ro.forEach((cb) => cb()));
    expect(document.querySelectorAll(".hero__thumb")).toHaveLength(1);
  });
  it("renders none where the column is not drawn (width 0: narrow and short windows)", async () => {
    width = 0;
    await mount();
    expect(document.querySelectorAll(".hero__thumb")).toHaveLength(0);
  });
});

describe("the thumbnails' CSS", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("hides the column everywhere except the one-screen hero (from 56em wide, 37.5em tall), where it is a column as tall as the photo with a small gap", () => {
    expect(css).toMatch(/\.hero__thumbs \{\s*display: none;\s*\}/);
    const block = /@media \(min-width: 56em\) and \(min-height: 37\.5em\) \{\s*\.hero__top \.hero__photo\[data-thumbs\] \{([^}]*)\}\s*\.hero__thumbs \{([^}]*)\}/.exec(css);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/grid-template-columns: auto minmax\(0, 1fr\)/);
    expect(block![1]).toMatch(/column-gap: var\(--space-2\)/);
    expect(block![2]).toMatch(/display: flex/);
    expect(block![2]).toMatch(/flex-direction: column/);
    expect(block![2]).toMatch(/gap: var\(--space-2\)/);
    expect(block![2]).toMatch(/place-self: stretch/);
  });
  it("gives the photo and the thumbnails of the hero with the card the theme's media radius, and leaves the hero without the card on --radius", () => {
    const rule = /\.hero\[data-card\] \.hero__box,\s*\.hero\[data-card\] \.hero__thumb \{([^}]*)\}/.exec(css);
    expect(rule?.[1]).toMatch(/border-radius: var\(--radius-media, var\(--radius\)\)/);
    expect(/(^|\})\s*\.hero__box \{([^}]*)\}/.exec(css)?.[2]).toMatch(/border-radius: var\(--radius\)/);
  });
  it("makes the thumbnails link boxes that cover, and shows the keyboard focus", () => {
    expect(css).toMatch(/\.hero__thumb:focus-visible \{\s*outline: 2px solid var\(--accent\)/);
    expect(css).toMatch(/\.hero__thumb-image \{[^}]*object-fit: cover/);
  });
});
