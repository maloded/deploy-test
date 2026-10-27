// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const site = (lang: "de" | "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
let root: Root | undefined;
let box: HTMLDivElement | undefined;
const mount = (lang: "de" | "en") => {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={site(lang)} />));
};
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const note = () => box!.querySelector("dialog .contact__prototype");
const form = () => box!.querySelector("dialog form.contact__form") as HTMLFormElement;

describe("the prototype note in the dialog (NEXT_PUBLIC_PROTOTYPE_NOTE)", () => {
  it("is one honest line near the submit button, in the page language, when the variable is set", () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "1");
    for (const lang of ["en", "de"] as const) {
      mount(lang);
      expect(note()!.textContent).toBe(ui("contact.prototype", lang));
      expect(form().querySelectorAll(".contact__prototype")).toHaveLength(1);
      expect(note()!.nextElementSibling!.matches('button[type="submit"]')).toBe(true); // right above the button
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
    }
    expect(ui("contact.prototype", "en")).toBe("Prototype: requests are not delivered yet.");
    expect(ui("contact.prototype", "de")).toBe("Prototyp: Anfragen werden noch nicht zugestellt.");
  });

  it("is not there without the variable (nothing changes), and not in the band or the static page", () => {
    mount("en");
    expect(note()).toBeNull();
    expect(box!.querySelector(".contact__prototype")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "1");
    expect(renderToStaticMarkup(<ProductLayout site={site("en")} />)).not.toContain("contact__prototype"); // the form is not in the HTML
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "");
    mount("de");
    expect(box!.querySelector(".contact__prototype")).toBeNull();
  });

  it("with the note and no store the API still answers 503: the form shows the e-mail link and never a success", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "unavailable" }), { status: 503, headers: { "content-type": "application/json" } })));
    mount("en");
    const set = (name: string, value: string) => {
      const el = form().querySelector(`[name=${name}]`) as HTMLInputElement;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    set("name", "Test Person");
    set("email", "person@example.invalid");
    act(() => void (form().querySelector("[name=consent]") as HTMLElement).click());
    await act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(box!.querySelector(".contact__success")).toBeNull();
    const summary = form().querySelector(".contact__summary")!;
    expect(summary.textContent).toContain(ui("contact.error.unavailable", "en"));
    expect(summary.querySelector("a")!.getAttribute("href")).toBe(`mailto:${site("en").seller.contact.email}`);
    expect(note()).toBeTruthy(); // the note stays: the request was not delivered
  });
});
