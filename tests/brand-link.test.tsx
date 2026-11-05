// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { buildSite } from "@/lib/site";
import { uiFmt } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

// The logo of the header and of the footer is a link to the top of the page: it scrolls (smoothly, instantly under reduced motion), focuses the main landmark, and clears
// the hash from the address (the language path and the query stay).

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount(lang: "en" | "de" = "en") {
  const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={site} />));
  return site;
}
let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  window.scrollTo = scrollTo as any;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.style.overflow = "";
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LOGOS = { header: "header .site-brand-link", footer: "footer .site-brand-link" } as const;
const logo = (where: keyof typeof LOGOS) => box!.querySelector<HTMLAnchorElement>(LOGOS[where])!;
const click = (el: Element, init: MouseEventInit = {}) => {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  act(() => void el.dispatchEvent(e));
  return e;
};

describe.each(Object.keys(LOGOS) as (keyof typeof LOGOS)[])("the %s logo", (where) => {
  it("is a link to the language page (a plain link without script) with the name 'Back to top' in its accessible name", async () => {
    const site = await mount("en");
    const a = logo(where);
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/en");
    expect(a.getAttribute("aria-label")).toBe(`${site.seller.displayName} – Back to top`);
    expect(a.textContent).toContain(site.seller.displayName); // the visible name is part of the accessible one
  });

  it("scrolls to the top smoothly, clears the hash, keeps the language path and the query, and focuses the main landmark", async () => {
    await mount("en");
    window.history.replaceState(null, "", "/en?ref=x#contact-offer");
    const before = window.history.length;
    const e = click(logo(where));
    expect(e.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/en?ref=x");
    expect(window.history.length).toBe(before); // replaceState: no new entry
    expect(document.activeElement).toBe(box!.querySelector("main"));
  });

  it("scrolls instantly for a visitor who asked for less motion", async () => {
    await mount("en");
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    window.scrollTo = scrollTo as any;
    click(logo(where));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("does nothing to the address when there is no hash, and a click with a modifier key is left to the browser", async () => {
    await mount("en");
    window.history.replaceState(null, "", "/en?ref=x");
    const replace = vi.spyOn(window.history, "replaceState");
    click(logo(where));
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?ref=x");
    scrollTo.mockClear();
    const e = click(logo(where), { ctrlKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("has the accessible name in every page language, the link leading to that language's page", async () => {
    for (const lang of ["de"] as const) {
      await mount(lang);
      const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
      expect(logo(where).getAttribute("aria-label")).toBe(uiFmt("brand.top", lang, { name: site.seller.displayName }));
      expect(logo(where).getAttribute("href")).toBe(`/${lang}`);
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
    }
    expect(uiFmt("brand.top", "de", { name: "X" })).toBe("X – Zum Seitenanfang");
  });

  it("with the contact dialog open it scrolls and leaves focus where the dialog has it", async () => {
    await mount("en");
    const section = box!.querySelector("#contact") as any;
    act(() => section.open());
    const inDialog = document.activeElement;
    expect(box!.querySelector("dialog")!.hasAttribute("open")).toBe(true);
    click(logo(where));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.activeElement).toBe(inDialog);
    expect(box!.querySelector("dialog")!.hasAttribute("open")).toBe(true);
  });
});
