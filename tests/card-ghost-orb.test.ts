// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aimOrb, createGhost, dropGhost, orbNow, orbRelOf, placeOrb } from "@/components/card-ghost";

const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** A card with the call button's area in it, at known boxes (happy-dom has no layout: the rects are given). */
function card(orb = true) {
  const c = document.createElement("section");
  c.className = "avatar-card";
  c.innerHTML = orb
    ? '<div class="avatar-card__action"><span class="call-orb" id="orb" data-state="idle"><i class="call-orb__glow"></i><button id="btn" class="call-orb__btn" type="button">x</button></span></div>'
    : '<div class="avatar-card__action"></div>';
  document.body.appendChild(c);
  const box = (l: number, t: number, w: number, h: number) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => ({}) }) as DOMRect;
  c.getBoundingClientRect = () => box(100, 200, 320, 400);
  c.querySelector(".avatar-card__action")!.getBoundingClientRect = () => box(100 + 320 - 8 - 116, 200 + 400 - 8 - 116, 116, 116); // 0.5em (8px) from the corner, 7.25em (116px)
  return c;
}
afterEach(() => {
  document.body.innerHTML = "";
});

describe("the call button's copy in the ghost", () => {
  it("knows where the button's area is on the card, relative to the card, and the card's font size", () => {
    const rel = orbRelOf(card());
    expect(rel).toMatchObject({ x: 320 - 8 - 116, y: 400 - 8 - 116, w: 116, h: 116 });
    expect(rel!.fs).toBeGreaterThan(0);
  });

  it("has none for a card without an orb button", () => {
    expect(orbRelOf(card(false))).toBeNull();
  });

  it("the ghost carries a copy of the orb (no ids, not focusable), inside a box of its own", () => {
    const c = card();
    const g = createGhost(c, { left: 100, top: 200, width: 320, height: 400 }, 28, 320);
    expect(g.orb).not.toBeNull();
    const box = g.el.querySelector(".card-ghost__orb")!;
    expect(box.querySelector(".call-orb")).not.toBeNull();
    expect(box.querySelector(".call-orb__btn")).not.toBeNull();
    expect(box.querySelector("[id]")).toBeNull(); // the real button keeps its id
    expect(box.querySelector("button")!.getAttribute("tabindex")).toBe("-1");
    expect(g.el.getAttribute("aria-hidden")).toBe("true");
    expect(c.querySelector("#btn")).not.toBeNull(); // the real one is untouched
    dropGhost(g, false);
  });

  it("a card without an orb button gets a ghost without one", () => {
    const g = createGhost(card(false), { left: 0, top: 0, width: 100, height: 125 }, 10, 100);
    expect(g.orb).toBeNull();
    expect(g.el.querySelector(".card-ghost__orb")).toBeNull();
    dropGhost(g, false);
  });

  it("is placed with the flight: box and font size are mixed from where it starts to where it ends", () => {
    const g = createGhost(card(), { left: 0, top: 0, width: 320, height: 400 }, 28, 320);
    aimOrb(g, { x: 200, y: 280, w: 116, h: 116, fs: 20 }, { x: 80, y: 90, w: 60, h: 60, fs: 10 });
    const box = g.el.querySelector<HTMLElement>(".card-ghost__orb")!;
    placeOrb(g, 0);
    expect([box.style.left, box.style.top, box.style.width, box.style.height, box.style.fontSize]).toEqual(["200px", "280px", "116px", "116px", "20px"]);
    placeOrb(g, 0.5);
    expect([box.style.left, box.style.top, box.style.width, box.style.fontSize]).toEqual(["140px", "185px", "88px", "15px"]);
    placeOrb(g, 1);
    expect([box.style.left, box.style.top, box.style.width, box.style.height, box.style.fontSize]).toEqual(["80px", "90px", "60px", "60px", "10px"]);
    dropGhost(g, false);
  });

  it("a flight taken over in the air starts the copy where it is now", () => {
    const g = createGhost(card(), { left: 0, top: 0, width: 320, height: 400 }, 28, 320);
    aimOrb(g, { x: 200, y: 280, w: 116, h: 116, fs: 20 }, { x: 80, y: 90, w: 60, h: 60, fs: 10 });
    placeOrb(g, 1);
    g.el.getBoundingClientRect = () => ({ left: 50, top: 60, width: 200, height: 250, right: 250, bottom: 310, x: 50, y: 60, toJSON: () => ({}) }) as DOMRect;
    g.orb!.box.getBoundingClientRect = () => ({ left: 130, top: 150, width: 60, height: 60, right: 190, bottom: 210, x: 130, y: 150, toJSON: () => ({}) }) as DOMRect;
    expect(orbNow(g)).toEqual({ x: 80, y: 90, w: 60, h: 60, fs: 10 });
    aimOrb(g, orbNow(g), { x: 10, y: 20, w: 30, h: 30, fs: 5 });
    placeOrb(g, 0);
    expect(g.orb!.box.style.left).toBe("80px"); // from where it was
    placeOrb(g, 1);
    expect(g.orb!.box.style.left).toBe("10px");
    dropGhost(g, false);
  });

  it("a new place without a button area leaves the copy as it is", () => {
    const g = createGhost(card(), { left: 0, top: 0, width: 320, height: 400 }, 28, 320);
    aimOrb(g, null, null);
    placeOrb(g, 0.7);
    expect(g.orb!.box.style.left).toBe(`${320 - 8 - 116}px`);
    dropGhost(g, false);
  });
});

describe("the stylesheet: the real button never stays up while the card flies", () => {
  it("the orb button's visibility is not eased (the later entry wins over `all`), on both of its rules", () => {
    const hits = [...css.matchAll(/transition:\s*all 0\.3s (?:cubic-bezier\(0\.4, 0, 0\.2, 1\)|ease),\s*visibility 0s;/g)];
    expect(hits).toHaveLength(2);
    expect(css).not.toMatch(/transition: all 0\.3s [^;,]*;/); // no `all` left that would ease visibility
  });

  it("the ghost's copy of the button is placed by the script and carries no transform of its own", () => {
    const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    expect(rule(".card-ghost__orb")).toMatch(/position: absolute;\s*pointer-events: none;/);
    expect(rule(".card-ghost__orb .call-orb")).toMatch(/display: block;/);
    for (const sel of [".card-ghost__orb", ".card-ghost__orb .call-orb"]) expect(rule(sel), sel).not.toMatch(/(^|;|\s)(transform|translate|scale|rotate|perspective|filter|backdrop-filter|will-change|contain)\s*:/);
  });

  it("the real card's looks (and so its button) stay hidden for the whole flight, and reduced motion has no ghost at all", () => {
    expect(css).toMatch(/\.avatar-card\[data-flight\] \.call-orb,\s*\.avatar-card\[data-flight\] \.avatar-card__start \{\s*visibility: hidden;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.card-ghost \{\s*display: none;/);
  });
});
