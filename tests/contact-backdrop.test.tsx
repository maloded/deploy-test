// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
let root: Root | undefined;
let box: HTMLDivElement | undefined;
const mount = () => {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={site} />));
};
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  vi.unstubAllGlobals();
});

const q = <T extends Element>(sel: string) => box!.querySelector(sel) as T;
const dialog = () => q<HTMLDialogElement>("dialog.contact-dialog");
const inner = () => q<HTMLElement>(".contact-dialog__box");
const field = (name: string) => q<HTMLInputElement>(`dialog [name=${name}]`);
const opener = () => q<HTMLAnchorElement>('.hero a[href="#contact"]'); // the header's button scrolls (data-contact="scroll"); the hero's opens the dialog
const open = () => act(() => void opener().click());
const press = (el: Element) => act(() => void el.dispatchEvent(new Event("pointerdown", { bubbles: true })));
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (k: string) => act(() => void dialog().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));

describe("a click outside the dialog box closes it", () => {
  it("all the content sits in an inner box, so a click inside never targets the dialog element", () => {
    mount();
    expect(dialog().children).toHaveLength(1);
    expect(dialog().firstElementChild).toBe(inner());
    for (const el of inner().querySelectorAll("*")) expect(el.closest("dialog")).toBe(dialog());
    expect(inner().contains(q("dialog form"))).toBe(true);
    expect(inner().contains(q("dialog .contact-dialog__close"))).toBe(true);
  });

  it("closes on a click whose target is the dialog element (the backdrop), and returns focus to the opener", () => {
    mount();
    opener().focus();
    open();
    expect(dialog().open).toBe(true);
    press(dialog());
    click(dialog());
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(opener());
  });

  it("does not close on a click inside the box, on a field, on the title or on the form", () => {
    mount();
    open();
    for (const el of [inner(), q("dialog form"), q("dialog .contact-dialog__title"), field("name"), q("dialog [type=submit]")]) {
      press(el);
      click(el);
      expect(dialog().open, el.className || el.tagName).toBe(true);
    }
  });

  it("does not close when the press started inside and was released outside (a text selection drag)", () => {
    mount();
    open();
    press(field("name")); // pointerdown in the field ...
    click(dialog()); // ... released on the backdrop: the browser fires the click on the common ancestor, the dialog
    expect(dialog().open).toBe(true);
    // and a later plain backdrop click still closes it
    press(dialog());
    click(dialog());
    expect(dialog().open).toBe(false);
  });

  it("does not close on a click that had no press at all (a synthetic click on the dialog)", () => {
    mount();
    open();
    click(dialog());
    expect(dialog().open).toBe(true);
  });

  it("does not close while a submit request is in flight, and does once it has finished", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))));
    mount();
    open();
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    act(() => void field("consent").click());
    await act(async () => void q("dialog form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(q<HTMLButtonElement>("dialog [type=submit]").disabled).toBe(true); // sending
    press(dialog());
    click(dialog());
    expect(dialog().open).toBe(true);
    await act(async () => finish(new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "content-type": "application/json" } })));
    press(dialog());
    click(dialog());
    expect(dialog().open).toBe(false);
  });

  it("keeps what was typed when the dialog is closed, by the backdrop, Escape or the close button", () => {
    mount();
    open();
    type(field("name"), "Typed once");
    type(field("email"), "person@example.invalid");
    press(dialog());
    click(dialog());
    expect(dialog().open).toBe(false);
    open();
    expect(field("name").value).toBe("Typed once");
    key("Escape");
    open();
    expect(field("name").value).toBe("Typed once");
    act(() => void q<HTMLElement>("dialog .contact-dialog__close").click());
    open();
    expect(field("name").value).toBe("Typed once");
    expect(field("email").value).toBe("person@example.invalid");
  });
});

describe("Escape and the close button still work", () => {
  it("Escape closes and focus returns to the opener", () => {
    mount();
    opener().focus();
    open();
    key("Escape");
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(opener());
  });

  it("the close button closes and focus returns to the opener", () => {
    mount();
    opener().focus();
    open();
    act(() => void q<HTMLElement>("dialog .contact-dialog__close").click());
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(opener());
  });

  it("the focus returns to the pressed button, not to the footer", () => {
    mount();
    const hero = q<HTMLAnchorElement>('.hero a[href="#contact"]');
    hero.focus();
    act(() => void hero.click());
    key("Escape");
    expect(document.activeElement).toBe(hero);
    expect(q("#contact").contains(document.activeElement)).toBe(false);
  });
});
