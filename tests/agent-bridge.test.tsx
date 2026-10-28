// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { navigateTarget } from "@/lib/agent-bridge";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount(agent: unknown = AGENT, lang: "de" | "en" = "en") {
  const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent } as any }} />));
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  window.location.hash = "";
  document.body.style.overflow = "";
});
const dialog = () => box!.querySelector("dialog.contact-dialog") as HTMLDialogElement;
const blocks = () => box!.querySelector<HTMLElement>("[data-block-order]")!.dataset.blockOrder!.split(" ");

describe("navigateTarget: the allow-list", () => {
  const origin = "https://page.example";
  const rendered = ["hero", "gallery", "offer", "contact"];
  const t = (path: unknown, lang: "de" | "en" = "en") => navigateTarget(path, lang, origin, rendered);

  it("accepts / and /<page language>, with no hash, #contact, a rendered block or #gallery-<n>", () => {
    expect(t("/")).toEqual({ kind: "top" });
    expect(t("/en")).toEqual({ kind: "top" });
    expect(t("/#contact")).toEqual({ kind: "contact" });
    expect(t("/en#contact")).toEqual({ kind: "contact" });
    expect(t("/en#offer")).toEqual({ kind: "hash", id: "offer" });
    expect(t("/#gallery-3")).toEqual({ kind: "hash", id: "gallery-3" });
    expect(t("/de#hero", "de")).toEqual({ kind: "hash", id: "hero" });
  });

  it("ignores everything else", () => {
    for (const path of ["/de", "/de#contact", "/fr", "/en/", "/en/x", "/en?a=1", "/?a=1#contact", "/api/lead", "//evil.example", "//evil.example/en", "https://page.example/en", "https://evil.example/en", "\\evil", "/\\evil", "/en#faq", "/en#nope", "/en#gallery-0", "/en#gallery-x", "/en#gallery-1000", "en", "", "#contact", "/%2Fen", "/en#contact2"]) {
      expect(t(path), path).toBeNull();
    }
    for (const bad of [undefined, null, 5, {}, ["/en"]]) expect(t(bad)).toBeNull();
    expect(navigateTarget("/en#gallery-2", "en", origin, ["hero"])).toBeNull(); // no gallery on this page
  });
});

describe("the command handler", () => {
  it("navigate #contact opens the dialog, is handled by preventDefault() alone and is not answered", async () => {
    await mount();
    const w = fakeWidget();
    for (const path of ["/#contact", "/en#contact"]) {
      act(() => void box!.querySelector<any>("#contact").close());
      expect(dialog().open).toBe(false);
      let call!: ReturnType<typeof w.command>;
      act(() => void (call = w.command("navigate", { path })));
      expect(call.handled, path).toBe(true);
      expect(call.answers, path).toEqual([]);
      expect(dialog().open, path).toBe(true);
    }
    w.remove();
  });

  it("other navigate paths follow the allow-list: a page target is handled, anything else is left alone (not prevented, not answered)", async () => {
    await mount();
    const w = fakeWidget();
    const block = blocks().find((id) => id !== "contact")!;
    const ok = w.command("navigate", { path: `/en#${block}` });
    expect(ok).toMatchObject({ handled: true, answers: [] });
    expect(window.location.hash).toBe(`#${block}`);
    expect(w.command("navigate", { path: "/" })).toMatchObject({ handled: true, answers: [] });
    for (const path of ["/de", "/de#contact", "//evil.example", "https://evil.example/", "/api/lead", "/en?x=1", "/en#unknown", 5, undefined]) {
      const call = w.command("navigate", { path });
      expect(call, String(path)).toMatchObject({ handled: false, answers: [] });
    }
    expect(w.command("navigate")).toMatchObject({ handled: false, answers: [] });
    expect(dialog().open).toBe(false);
    w.remove();
  });

  it("navigate never leaves the page: the location keeps its path", async () => {
    await mount();
    const w = fakeWidget();
    const before = window.location.pathname + window.location.search;
    for (const path of ["/en#offer", "/#contact", "/", "/de", "//evil.example"]) w.command("navigate", { path });
    expect(window.location.pathname + window.location.search).toBe(before);
    w.remove();
  });

  it("page_context is answered once, synchronously, with the page basics", async () => {
    await mount(AGENT, "de");
    document.title = "A page title";
    const w = fakeWidget();
    const call = w.command("page_context");
    expect(call.handled).toBe(true);
    expect(call.answeredSynchronously).toBe(true);
    expect(call.answers).toHaveLength(1);
    expect(call.answers[0]).toMatchObject({ language: "de", product: `${fixtures.seller}/fixture-car`, path: window.location.pathname, title: "A page title" });
    w.remove();
  });

  it("cart_state and any other command are ignored: no preventDefault(), no answer", async () => {
    await mount();
    const w = fakeWidget();
    for (const type of ["cart_state", "show_form", "hide_form", "set_field", "prefill", "submit", "open_contact", "", "NAVIGATE"]) {
      expect(w.command(type, { path: "/#contact" }), type).toMatchObject({ handled: false, answers: [] });
    }
    expect(w.command("cart_state")).toMatchObject({ handled: false, answers: [], answeredSynchronously: false });
    expect(dialog().open).toBe(false);
    w.remove();
  });

  it("an event without respond() is ignored", async () => {
    await mount();
    const e = new CustomEvent("agent-command", { detail: { type: "page_context" }, cancelable: true });
    expect(document.dispatchEvent(e)).toBe(true);
  });

  it("nothing is registered without an agent in seller.json, and the handler goes away with the widget", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await mount(null);
    expect(add.mock.calls.filter(([n]) => n === "agent-command")).toEqual([]);
    const w = fakeWidget();
    expect(w.command("page_context")).toMatchObject({ handled: false, answers: [] });
    expect(w.command("navigate", { path: "/#contact" })).toMatchObject({ handled: false, answers: [] });
    expect(dialog().open).toBe(false);
    add.mockRestore();
    act(() => root!.unmount());
    root = undefined;
    box?.remove();
    await mount();
    expect(w.command("page_context").handled).toBe(true);
    act(() => root!.unmount());
    root = undefined;
    expect(w.command("page_context").handled).toBe(false);
    w.remove();
  });
});
