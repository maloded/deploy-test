// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import type { ContactElement } from "@/components/ContactSection";
import { BUTTON_PRESETS, resolvePreset } from "@/lib/request-types";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { examples, FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const car = (lang: "de" | "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
const house = (lang: "de" | "en") => buildSite(null, examples.ref("example-house"), examples.root, lang);
type TestSite = ReturnType<typeof car>;
let root: Root | undefined;
let box: HTMLDivElement | undefined;
const mount = (site: TestSite) => {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={site} />));
};
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.querySelectorAll("a.test-link").forEach((a) => a.remove());
});

const q = <T extends Element>(sel: string) => box!.querySelector(sel) as T;
const dialog = () => q<HTMLDialogElement>("dialog.contact-dialog");
const form = () => q<HTMLFormElement>("dialog form.contact__form");
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLInputElement;
const title = () => q("dialog .contact-dialog__title").textContent;
const selected = () => (field("requestType") as unknown as HTMLSelectElement).value;
const hero = () => q<HTMLAnchorElement>('.hero a[href="#contact"]');
const offer = () => q<HTMLAnchorElement>('.offer a[href="#contact"]');
const click = (el: Element) => act(() => void (el as HTMLElement).click());
const esc = () => act(() => void dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
/** A link as another part of a page might carry it (for example a future block), outside the band. */
const extraLink = (requestType: string) => {
  const a = document.createElement("a");
  a.href = "#contact";
  a.dataset.requestType = requestType;
  a.className = "test-link";
  document.body.appendChild(a);
  return a;
};

describe("one button per place, with its preset in the markup", () => {
  it("the presets are data: header and hero ask a question, the offer block makes an offer (the page header's own button has none: it scrolls; the preset is the agent widget's contact link's)", () => {
    expect(BUTTON_PRESETS).toEqual({ header: "question", hero: "question", offer: "offer" });
  });

  it("the static page has exactly one #contact button in the header (a plain scroll link), one in the hero and one in the offer block (plain links with data-request-type)", () => {
    for (const lang of ["en", "de"] as const) {
      const out = renderToStaticMarkup(<ProductLayout site={car(lang)} />);
      const part = (open: string, close: string) => out.slice(out.indexOf(open), out.indexOf(close, out.indexOf(open)));
      const links = (html: string) => [...html.matchAll(/<a class="([^"]*)" href="#contact"( data-request-type="([a-z_]+)")?>([^<]*)<\/a>/g)].map((m) => ({ cls: m[1], type: m[3], text: m[4] }));
      // the header's button is a plain link that scrolls to the footer's contact row: no preset, data-contact="scroll"
      expect([...part("<header", "</header>").matchAll(/<a class="([^"]*)" href="#contact"( data-request-type="[a-z_]+")?( data-contact="(\w+)")?>([^<]*)<\/a>/g)].map((m) => ({ cls: m[1], preset: m[2], contact: m[4], text: m[5] }))).toEqual([
        { cls: "button button--small", preset: undefined, contact: "scroll", text: ui("header.cta", lang) },
      ]);
      expect(links(part('<section class="hero"', "</section>"))).toEqual([{ cls: "button", type: "question", text: ui("hero.cta", lang) }]);
      expect(links(part('<section class="offer"', "</section>"))).toEqual([{ cls: "button", type: "offer", text: ui("offer.cta.offer", lang) }]);
    }
    expect(ui("offer.cta.offer", "en")).toBe("Make an offer");
    expect(ui("offer.cta.offer", "de")).toBe("Angebot machen");
  });

  it("an offer button for a product that does not offer offers asks a question and keeps the neutral label", () => {
    const s = car("en");
    const without = { ...s, typeFields: { ...s.typeFields, requestTypes: ["question"] as const } } as unknown as TestSite;
    const out = renderToStaticMarkup(<ProductLayout site={without} />);
    expect(out).not.toContain('data-request-type="offer"');
    expect(out).toMatch(/<section class="offer"[\s\S]*data-request-type="question">Request details<\/a>/);
  });

  it("exactly three buttons outside the contact row after hydration: no duplicate in the offer block", () => {
    mount(car("en"));
    expect([...box!.querySelectorAll('a[href="#contact"]')].filter((a) => !q("#contact").contains(a))).toHaveLength(3);
    expect(box!.querySelectorAll('.offer a[href="#contact"]')).toHaveLength(1);
    expect(box!.querySelectorAll('.offer .button')).toHaveLength(1);
    expect(q("#contact .site-footer__row").querySelectorAll(".button")).toHaveLength(0); // the contact row has no call-to-action button
  });
});

describe("each button opens the dialog with its preset and title", () => {
  it.each([
    ["hero", hero, "question", "Request details", "Details anfragen"],
    ["offer", offer, "offer", "Make an offer", "Angebot machen"],
  ] as const)("%s", (_place, button, type, en, de) => {
    for (const [lang, expected] of [["en", en], ["de", de]] as const) {
      mount(car(lang));
      click(button());
      expect(dialog().open).toBe(true);
      expect(selected()).toBe(type);
      expect(title()).toBe(expected);
      expect(dialog().getAttribute("aria-labelledby")).toBe(q("dialog .contact-dialog__title").id);
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
    }
  });

  it("the other types are named by their label (a viewing for the house example)", () => {
    for (const [lang, label] of [["en", "Viewing"], ["de", "Besichtigung"]] as const) {
      mount(house(lang));
      click(extraLink("viewing"));
      expect(selected()).toBe("viewing");
      expect(title()).toBe(label);
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
    }
  });

  it("the visitor can change the type in the dialog; the title keeps the button's", () => {
    mount(car("en"));
    click(offer());
    type(field("requestType") as unknown as HTMLSelectElement, "question");
    expect(selected()).toBe("question");
    expect(title()).toBe("Make an offer");
  });
});

describe("the preset replaces the type and nothing else", () => {
  it("overwrites what was chosen before, keeps what was typed, and does not touch the fill timer", () => {
    mount(car("en"));
    click(offer());
    type(field("name"), "Typed once");
    type(field("email"), "person@example.invalid");
    type(field("requestType") as unknown as HTMLSelectElement, "question");
    esc();
    click(offer());
    expect(selected()).toBe("offer"); // the pressed button wins over the earlier choice
    expect(field("name").value).toBe("Typed once");
    expect(field("email").value).toBe("person@example.invalid");
    esc();
    click(hero());
    expect(selected()).toBe("question");
    expect(field("name").value).toBe("Typed once");
    expect(title()).toBe("Request details");
  });

  it("a preset the product does not offer falls back to question (also for unknown values)", () => {
    mount(car("en")); // no viewing settings: no viewing, no test drive
    for (const preset of ["viewing", "test_drive", "toString", "", "OFFER"]) {
      const link = extraLink(preset);
      click(link);
      expect(selected(), preset).toBe("question");
      expect(title(), preset).toBe("Request details");
      esc();
    }
    expect(resolvePreset("offer", ["question"])).toBe("question");
    expect(resolvePreset("offer", ["question", "offer"])).toBe("offer");
  });

  it("a plain #contact link without a preset asks a question", () => {
    mount(car("en"));
    click(offer());
    esc();
    const link = document.createElement("a");
    link.href = "#contact";
    link.className = "test-link";
    document.body.appendChild(link);
    click(link);
    expect(selected()).toBe("question");
  });
});

describe("the agent interface", () => {
  it("open() takes no argument and always uses question, whatever was used before and whatever has focus", () => {
    mount(car("en"));
    const el = q<ContactElement>("#contact");
    expect(el.open.length).toBe(0);
    click(offer());
    expect(selected()).toBe("offer");
    esc();
    offer().focus(); // the offer button has focus, but the agent did not press it
    act(() => el.open());
    expect(selected()).toBe("question");
    expect(title()).toBe("Request details");
    act(() => el.close());
    expect(Object.keys(el).filter((k) => typeof (el as any)[k] === "function").sort()).toEqual(["close", "open"]);
  });
});

describe("focus and autofill", () => {
  it("focus lands on the Name input after open (not on the select or the close button) and returns to the opener after close", () => {
    mount(car("en"));
    for (const button of [hero, offer]) {
      const opener = button();
      opener.focus();
      click(opener);
      expect(document.activeElement, opener.className).toBe(field("name"));
      expect(document.activeElement).not.toBe(field("requestType"));
      esc();
      expect(dialog().open).toBe(false);
      expect(document.activeElement).toBe(opener);
    }
  });

  it("focus lands on the Name input when the agent opens it, too", () => {
    mount(car("de"));
    act(() => q<ContactElement>("#contact").open());
    expect(document.activeElement).toBe(field("name"));
  });

  it("every personal field carries the right autocomplete token", () => {
    mount(car("en"));
    expect(field("name").getAttribute("autocomplete")).toBe("name");
    expect(field("email").getAttribute("autocomplete")).toBe("email");
    expect(field("phone").getAttribute("autocomplete")).toBe("tel");
    expect(field("email").type).toBe("email");
    expect(field("phone").type).toBe("tel");
    expect(field("website").getAttribute("autocomplete")).toBe("off"); // the honeypot is never autofilled
  });

  it("the fine-pointer option exists and is off", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/ContactSection.tsx", "utf8");
    expect(src).toContain("const AUTOFOCUS_ONLY_WITH_FINE_POINTER = false;");
    expect(src).toContain('(pointer: fine)');
    expect(fs.readFileSync("PROJECT.md", "utf8")).toContain("AUTOFOCUS_ONLY_WITH_FINE_POINTER");
  });
});
