// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Specs } from "@/components/Specs";
import { buildSite } from "@/lib/site";
import { UI_KEYS, ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const site = (lang: "de" | "en" = "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang) as any;
/** A row key of the second group (a group that is collapsed on a phone). */
const bodyKey = () => site().product.specs.find((x: any) => x.group === "body").key as string;
const withGroups = (s: any, n: number) => {
  // keep the first n groups of the fixture (engine, body, interior)
  const keep = ["engine", "body", "interior"].slice(0, n);
  return { ...s, product: { ...s.product, specs: s.product.specs.filter((x: any) => keep.includes(x.group)) } };
};

describe("the specifications in the HTML (for search engines, screen readers and keyboards)", () => {
  const out = renderToStaticMarkup(<Specs site={site()} />);

  it("has every group with all its rows, collapsed or not: the content is always there", () => {
    expect(out.match(/<dl /g)).toHaveLength(3);
    for (const s of site().product.specs) expect(out).toContain(`id="spec-${s.key}"`);
    expect(out).toContain('id="specs"');
  });

  it("opens the first group and collapses the others in the first paint (no jump when the script runs)", () => {
    expect([...out.matchAll(/data-group="(\w+)" data-open="(true|false)"/g)].map((m) => `${m[1]}:${m[2]}`)).toEqual(["engine:true", "body:false", "interior:false"]);
  });

  it("makes each title a button with aria-expanded and aria-controls naming a region it labels", () => {
    for (const g of ["engine", "body", "interior"]) {
      expect(out).toMatch(new RegExp(`<button type="button" class="specs__toggle" id="specs-toggle-${g}" aria-expanded="(true|false)" aria-controls="specs-panel-${g}"`));
      expect(out).toContain(`id="specs-panel-${g}" role="region" aria-labelledby="specs-toggle-${g}"`);
    }
    expect(out).toMatch(/id="specs-toggle-engine" aria-expanded="true"/);
    expect(out).toMatch(/id="specs-toggle-body" aria-expanded="false"/);
  });

  it("keeps the h3 headings (the toggle is inside them) and hides the chevron from assistive technology", () => {
    expect(out).toMatch(/<h3 class="label specs__heading"><button/);
    expect(out).toMatch(/<svg class="specs__chevron" aria-hidden="true"/);
  });

  it("has all the ids once", () => {
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has the 'show all' button in the page language, controlling every panel", () => {
    expect(out).toContain(">Show all specifications</button>");
    expect(out).toMatch(/class="specs__all" aria-expanded="false" aria-controls="specs-panel-engine specs-panel-body specs-panel-interior"/);
    expect(renderToStaticMarkup(<Specs site={site("de")} />)).toContain(">Alle technischen Daten anzeigen</button>");
  });

  it("has no 'show all' button when there is only one group", () => {
    expect(renderToStaticMarkup(<Specs site={withGroups(site(), 1)} />)).not.toContain("specs__all");
  });

  it("has its strings in both languages", () => {
    for (const k of ["specs.showAll", "specs.showLess"] as const) {
      expect(UI_KEYS).toContain(k);
      expect(ui(k, "de")).not.toBe(ui(k, "en"));
    }
    expect(ui("specs.showLess", "de")).toBe("Weniger anzeigen");
    expect(ui("specs.showLess", "en")).toBe("Show less");
  });
});

describe("on a phone", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let phone = true;
  let reduced = false;
  let scrolled: { behavior?: string; block?: string }[] = [];

  beforeEach(() => {
    phone = true;
    reduced = false;
    scrolled = [];
    window.location.hash = "";
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("56.25em") ? phone : q.includes("reduce") ? reduced : false, addEventListener() {}, removeEventListener() {} });
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => (setTimeout(() => cb(0), 0), 1);
    Element.prototype.scrollIntoView = function (this: Element, o?: any) {
      scrolled.push({ ...(o ?? {}), ...{ el: (this as HTMLElement).className || (this as HTMLElement).id } } as any);
    };
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    window.location.hash = "";
    vi.restoreAllMocks();
  });

  const mount = async (s = site()) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<Specs site={s} />));
  };
  const toggle = (g: string) => box!.querySelector<HTMLButtonElement>(`#specs-toggle-${g}`)!;
  const group = (g: string) => box!.querySelector<HTMLElement>(`[data-group="${g}"]`)!;
  const click = (el: Element) => act(async () => void (el as HTMLElement).click());
  const all = () => box!.querySelector<HTMLButtonElement>(".specs__all")!;
  const state = () => ["engine", "body", "interior"].map((g) => group(g).dataset.open![0]).join("");
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

  it("one tap opens a group, another closes it; several may be open (an accordion that does not close the others)", async () => {
    await mount();
    expect(state()).toBe("tff");
    await click(toggle("body"));
    expect(state()).toBe("ttf");
    expect(toggle("body").getAttribute("aria-expanded")).toBe("true");
    await click(toggle("interior"));
    expect(state()).toBe("ttt");
    await click(toggle("engine")); // the first group too
    expect(state()).toBe("ftt");
    expect(toggle("engine").getAttribute("aria-expanded")).toBe("false");
  });

  it("'show all' opens every group and then says 'Show less'; 'Show less' goes back to the first group only and brings the section's title into view", async () => {
    await mount();
    expect(all().textContent).toBe("Show all specifications");
    await click(all());
    expect(state()).toBe("ttt");
    expect(all().textContent).toBe("Show less");
    expect(all().getAttribute("aria-expanded")).toBe("true");
    expect(scrolled).toHaveLength(0); // opening scrolls nothing
    await click(all());
    await settle();
    expect(state()).toBe("tff");
    expect(all().textContent).toBe("Show all specifications");
    expect(scrolled).toEqual([expect.objectContaining({ behavior: "smooth", block: "start", el: "section-title" })]);
  });

  it("the button says 'Show less' also when the visitor has opened the last group by hand", async () => {
    await mount();
    await click(toggle("body"));
    await click(toggle("interior"));
    expect(all().textContent).toBe("Show less");
  });

  it("scrolls without animation under reduced motion", async () => {
    reduced = true;
    await mount();
    await click(all());
    await click(all());
    await settle();
    expect(scrolled[0]).toMatchObject({ behavior: "auto" });
  });

  it("opens the group of a hash that names a row in a collapsed group, at once (no animation), and brings the row into view", async () => {
    window.location.hash = `#spec-${bodyKey()}`;
    await mount();
    await settle();
    await settle();
    const row = box!.querySelector(`#spec-${bodyKey()}`)!;
    expect(row.closest("[data-group]")!.getAttribute("data-open")).toBe("true");
    expect(scrolled.some((s: any) => s.el === "details__row")).toBe(true);
    expect(box!.querySelector<HTMLElement>(".specs__body")!.hasAttribute("data-instant")).toBe(false); // the animation is back on afterwards
  });

  it("follows a hash that changes later, opens only the group it needs, and leaves other hashes alone", async () => {
    await mount();
    window.location.hash = "#specs"; // the section itself: nothing to open
    await act(async () => void window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(state()).toBe("tff");
    window.location.hash = "#elsewhere";
    await act(async () => void window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(state()).toBe("tff");
    const bodyRow = [...box!.querySelectorAll(".details__row")].find((r) => r.closest("[data-group]")!.getAttribute("data-group") === "interior")!;
    window.location.hash = `#${bodyRow.id}`;
    await act(async () => void window.dispatchEvent(new HashChangeEvent("hashchange")));
    await settle();
    expect(state()).toBe("tft");
  });

  it("a hash into a group that is already open changes nothing (the browser's own scroll is right)", async () => {
    window.location.hash = "#spec-power";
    await mount();
    await settle();
    expect(state()).toBe("tff");
    expect(scrolled).toHaveLength(0);
  });

  it("the toggles are real buttons, in the tab order, that react to the click the keyboard makes", async () => {
    await mount();
    for (const b of box!.querySelectorAll<HTMLButtonElement>(".specs__toggle")) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.disabled).toBe(false);
      expect(b.tabIndex).toBe(0);
    }
  });
});

describe("on a wide screen", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  beforeEach(() => {
    (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.location.hash = "";
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    window.location.hash = "";
  });
  const mount = async () => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<Specs site={site()} />));
  };

  it("every group is shown: the toggles are inert and say expanded (the panels are always visible), so nothing is announced as collapsed", async () => {
    await mount();
    for (const b of box!.querySelectorAll<HTMLButtonElement>(".specs__toggle")) {
      expect(b.disabled).toBe(true);
      expect(b.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("a hash to a row opens nothing (there is nothing closed)", async () => {
    window.location.hash = `#spec-${bodyKey()}`;
    await mount();
    expect([...box!.querySelectorAll("[data-group]")].map((g) => g.getAttribute("data-open")![0]).join("")).toBe("tff"); // the state is untouched; the CSS shows every group
  });
});

describe("the stylesheet", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const from = css.indexOf("The group's title is a button (SpecsGroups.tsx)");
  const block = css.slice(from);
  const phoneStart = block.indexOf("@media (width < 56.25em) {");
  const wide = block.slice(0, phoneStart); // before the phone query: what every screen gets
  const phone = block.slice(phoneStart, block.indexOf("/* offer */"));

  it("on every screen: a plain title (inert, no chevron, no 'show all')", () => {
    expect(wide).toMatch(/\.specs__toggle \{[^}]*cursor: default;/);
    expect(wide).toMatch(/\.specs__chevron,\s*\.specs__all \{\s*display: none;/);
    expect(wide).not.toMatch(/visibility|grid-template-rows|overflow/); // the panels are never hidden outside the phone query
  });

  it("below 900px only: a 44px row per group, the chevron, the collapsed panel at 0 height, and the 'show all' text button of 44px", () => {
    expect(phone).toMatch(/\.specs__toggle \{\s*min-height: 2\.75rem;\s*cursor: pointer;/);
    expect(phone).toMatch(/\.specs__chevron \{\s*display: block;/);
    expect(phone).toMatch(/\.specs__all \{[^}]*display: flex;[^}]*min-height: 2\.75rem;/);
    expect(phone).toMatch(/\.specs__panel \{\s*display: grid;\s*grid-template-rows: 0fr;\s*visibility: hidden;/);
    expect(phone).toMatch(/\.specs__group\[data-open="true"\] \.specs__panel \{\s*grid-template-rows: 1fr;\s*visibility: visible;/);
    expect(phone).toMatch(/\.specs__panel > \.details \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  });

  it("animates the height over 250 ms (and the chevron), and not at all under reduced motion or for a link into a closed group", () => {
    expect(phone).toMatch(/grid-template-rows 250ms ease,\s*visibility 0s 250ms;/);
    expect(phone).toMatch(/transition: transform 250ms ease;/);
    expect(phone).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.specs__group\[data-open="true"\] \.specs__panel,[^@]*transition: none;/);
    expect(phone).toMatch(/\.specs__body\[data-instant\] \.specs__panel,\s*\.specs__body\[data-instant\] \.specs__chevron \{\s*transition: none;/);
  });

  it("uses theme tokens only: no raw colour, a visible focus ring", () => {
    expect(phone).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(phone).toMatch(/\.specs__toggle:focus-visible,\s*\.specs__all:focus-visible \{\s*outline: 2px solid var\(--accent-line, var\(--accent\)\);/);
  });
});
