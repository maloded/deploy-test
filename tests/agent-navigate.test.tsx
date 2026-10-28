// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount(lang: "de" | "en" = "en") {
  const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: AGENT } as any }} />));
}
const gallery = () => box!.querySelector("#gallery") as any;
const count = () => Number(gallery().dataset.count);
const counter = () => box!.querySelector("[data-gallery-live]")?.textContent ?? "";
const slideNow = () => (box!.querySelector(".gallery__counter")?.textContent ?? "");
const dialog = () => box!.querySelector("dialog.contact-dialog") as HTMLDialogElement;

let scrollIntoView: ReturnType<typeof vi.fn>;
let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollIntoView = vi.fn();
  scrollTo = vi.fn();
  (Element.prototype as any).scrollIntoView = scrollIntoView;
  vi.stubGlobal("scrollTo", scrollTo);
  (window as any).scrollTo = scrollTo;
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  delete (Element.prototype as any).scrollIntoView;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe("navigate #gallery-<n> (1-based)", () => {
  it("centres photo n through goToPhoto(n - 1), scrolls the gallery into view, opens no lightbox and loads no page", async () => {
    await mount();
    expect(count()).toBeGreaterThan(2);
    const goToPhoto = vi.spyOn(gallery(), "goToPhoto");
    const w = fakeWidget();
    const before = window.location.pathname;
    for (const prefix of ["/", "/en"]) {
      let call!: ReturnType<typeof w.command>;
      act(() => void (call = w.command("navigate", { path: `${prefix}#gallery-3` })));
      expect(call, prefix).toMatchObject({ handled: true, answers: [] });
    }
    expect(goToPhoto).toHaveBeenCalledWith(2); // photo 3 is index 2
    expect(slideNow()).toContain(`3 / ${count()}`);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(box!.querySelector("dialog.lightbox[open]")).toBeNull();
    expect(window.location.pathname).toBe(before);
    expect(window.location.hash).toBe("#gallery-3");
    w.remove();
  });

  it("the first and the last photo are accepted", async () => {
    await mount();
    const w = fakeWidget();
    act(() => void w.command("navigate", { path: "/#gallery-1" }));
    expect(slideNow()).toContain(`1 / ${count()}`);
    let call!: ReturnType<typeof w.command>;
    act(() => void (call = w.command("navigate", { path: `/#gallery-${count()}` })));
    expect(call.handled).toBe(true);
    expect(slideNow()).toContain(`${count()} / ${count()}`);
    w.remove();
  });

  it("a number outside 1..count is ignored: not prevented, not answered, nothing moves", async () => {
    await mount();
    const goToPhoto = vi.spyOn(gallery(), "goToPhoto");
    const w = fakeWidget();
    for (const n of [0, count() + 1, 99, 1000]) {
      expect(w.command("navigate", { path: `/#gallery-${n}` }), String(n)).toMatchObject({ handled: false, answers: [] });
    }
    expect(w.command("navigate", { path: "/#gallery-x" })).toMatchObject({ handled: false });
    expect(w.command("navigate", { path: "/#gallery--1" })).toMatchObject({ handled: false });
    expect(goToPhoto).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    w.remove();
  });

  it("respects reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    await mount();
    const w = fakeWidget();
    act(() => void w.command("navigate", { path: "/#gallery-2" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    w.remove();
  });

  it("a visitor who types #gallery-n gets the same photo, and an out-of-range number does nothing", async () => {
    window.location.hash = "#gallery-4";
    await mount();
    expect(slideNow()).toContain(`4 / ${count()}`);
    window.location.hash = `#gallery-${count() + 5}`;
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(slideNow()).toContain(`4 / ${count()}`); // ignored, not clamped
    window.location.hash = "#gallery-2";
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(slideNow()).toContain(`2 / ${count()}`);
    window.location.hash = "";
  });
});

describe("navigate #top", () => {
  const main = () => box!.querySelector("main") as HTMLElement;

  it("scrolls smoothly to the top and focuses the main landmark, with no page load and no redirect", async () => {
    await mount();
    const w = fakeWidget();
    const before = window.location.href;
    for (const path of ["/#top", "/en#top"]) {
      scrollTo.mockClear();
      (document.activeElement as HTMLElement | null)?.blur?.();
      let call!: ReturnType<typeof w.command>;
      act(() => void (call = w.command("navigate", { path })));
      expect(call, path).toMatchObject({ handled: true, answers: [] });
      expect(scrollTo, path).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
      expect(document.activeElement, path).toBe(main());
    }
    expect(main().getAttribute("tabindex")).toBe("-1");
    expect(window.location.href).toBe(before); // nothing navigated, "/" was not redirected to a language
    w.remove();
  });

  it("is instant under prefers-reduced-motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    await mount();
    const w = fakeWidget();
    act(() => void w.command("navigate", { path: "/#top" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    w.remove();
  });

  it("does not steal focus from an open dialog (but still scrolls and answers done)", async () => {
    await mount();
    act(() => void (box!.querySelector("#contact") as any).open());
    expect(dialog().open).toBe(true);
    const inside = document.activeElement;
    expect(dialog().contains(inside)).toBe(true);
    const w = fakeWidget();
    let call!: ReturnType<typeof w.command>;
    act(() => void (call = w.command("navigate", { path: "/#top" })));
    expect(call).toMatchObject({ handled: true, answers: [] });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.activeElement).toBe(inside);
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(dialog().open).toBe(true);
    w.remove();
  });

  it("another language, a query or another origin with #top is ignored; a plain / keeps its old behaviour (instant, no focus)", async () => {
    await mount();
    const w = fakeWidget();
    for (const path of ["/de#top", "/?a=1#top", "//evil.example/#top", "https://evil.example/#top", "/api/lead#top", "/#top2", "/#TOP", "/en/#top"]) {
      expect(w.command("navigate", { path }), path).toMatchObject({ handled: false, answers: [] });
    }
    expect(scrollTo).not.toHaveBeenCalled();
    // as before this change: a plain "/" and "/en" are handled with an instant scroll and no focus change
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(w.command("navigate", { path: "/" })).toMatchObject({ handled: true, answers: [] });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    expect(document.activeElement).not.toBe(main());
    w.remove();
  });
});
