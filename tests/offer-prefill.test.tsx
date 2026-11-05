// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { EXAMPLES_DIR, FIXTURE_DIR, examples, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";
import { chooseType, clickEl } from "./form-ui";

// The amount of an offer starts at the asking price (a fixed sale price only), says how far it is from it, and names the range only for an amount outside it.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
/** "house": 890,000 EUR, a fixed price (offers 445,000 to 2,670,000); "car": 589 EUR per month, so no price to start from. */
async function mount(which: "car" | "house", lang: "en" | "de") {
  const site = which === "car" ? buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang) : buildSite(null, examples.ref("example-house"), EXAMPLES_DIR, lang);
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: AGENT } as any }} />));
}
beforeEach(() => resetFormSnapshotForTests());
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

const section = () => box!.querySelector("#contact") as any;
const form = () => box!.querySelector("dialog form") as HTMLFormElement;
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const send = () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const reply = (id = "AB12CD34") => {
  const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  return call.answers[0] as Record<string, any>;
};
const navigate = (path: string, call = false) => {
  const w = fakeWidget();
  if (call) document.dispatchEvent(new Event("call-start"));
  act(() => void w.command("navigate", { path }));
  w.remove();
};
const hint = () => form().querySelector<HTMLElement>(".contact__hint[id$='amount-hint']")!;
/** What the field says under it, or "" while nothing is shown. */
const said = () => (hint().hidden ? "" : hint().textContent!.trim());
const errors = () => [...form().querySelectorAll(".contact__summary li")].map((li) => li.textContent);
const fillOffer = () => {
  type(field("name"), "Test Person");
  type(field("email"), "person@example.invalid");
  type(field("phone"), "+00 000 000 000");
  act(() => void field("consent").click());
};

describe("the amount starts at the asking price", () => {
  it("is the price in the page language: 890,000 in English, 890.000 in German", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    expect(field("amount").value).toBe("890,000");
    act(() => root!.unmount());
    box!.remove();
    await mount("house", "de");
    navigate("/#contact-offer");
    expect(field("amount").value).toBe("890.000");
  });

  it("is there when the offer tab is chosen inside the open dialog too", async () => {
    await mount("house", "en");
    act(() => section().open());
    chooseType(box!, "offer");
    expect(field("amount").value).toBe("890,000");
  });

  it("is not there for a price per month (rent): the field starts empty, and nothing is said under it", async () => {
    await mount("car", "en");
    navigate("/#contact-offer");
    expect(field("amount").value).toBe("");
    expect(said()).toBe("");
    type(field("amount"), "500");
    expect(said()).toBe("");
  });

  it("counts as filled for the agent: page_context lists the amount as missing only once the visitor clears it", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    expect(ask().form.missing).toEqual(["name", "email", "phone", "consent"]);
    type(field("amount"), "");
    expect(ask().form.missing).toEqual(["amount", "name", "email", "phone", "consent"]);
  });

  it("a prefilled price is sent as the amount when nothing else is changed; the owner gets the same amount as a number", async () => {
    await mount("house", "en");
    const f = reply();
    navigate("/#contact-offer");
    fillOffer();
    await send();
    expect(JSON.parse((f.mock.calls as any)[0][1].body)).toMatchObject({ requestType: "offer", amount: 890000, lang: "en" });
  });

  it("'another request' starts at the price again, not at what was typed", async () => {
    await mount("house", "en");
    reply();
    navigate("/#contact-offer");
    fillOffer();
    type(field("amount"), "800,000");
    await send();
    clickEl(box!.querySelector(".contact__success button"), "another request");
    expect(field("amount").value).toBe("890,000");
    expect(ask().form.missing).toEqual(["name", "email", "phone", "consent"]);
  });
});

describe("focus and caret", () => {
  it("opening the offer (the agent's navigate) focuses the amount with the caret after the last digit", async () => {
    await mount("house", "de");
    navigate("/#contact-offer");
    const amount = field("amount");
    expect(document.activeElement).toBe(amount);
    expect(amount.selectionStart).toBe(amount.value.length);
    expect(amount.selectionEnd).toBe(amount.value.length);
    expect(amount.value).toBe("890.000");
  });

  it("the same in a call: the amount, optional there, takes focus because it starts with a price", async () => {
    await mount("house", "en");
    navigate("/#contact-offer", true);
    expect(document.activeElement).toBe(field("amount"));
    expect(field("amount").selectionStart).toBe("890,000".length);
  });

  it("a link of the page with the offer type opens the same way", async () => {
    await mount("house", "en");
    const link = box!.querySelector<HTMLElement>("a[data-request-type=offer]");
    expect(link).toBeTruthy();
    act(() => link!.click());
    expect(document.activeElement).toBe(field("amount"));
    expect(field("amount").selectionStart).toBe(field("amount").value.length);
  });
});

describe("the live difference to the asking price", () => {
  it("equal to the price: a quiet line says so, in the page language", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    expect(said()).toBe(ui("contact.amount.same", "en"));
  });

  it("below: the sign, the euros and the share of the price (English, German)", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    type(field("amount"), "850,000");
    expect(said()).toBe("−€40,000 (−4.5%) vs. asking price");
    act(() => root!.unmount());
    box!.remove();
    await mount("house", "de");
    navigate("/#contact-offer");
    type(field("amount"), "850.000");
    expect(said()).toBe("−40.000 € (−4,5 %) zum Angebotspreis");
  });

  it("above: a plus sign", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    type(field("amount"), "950,000");
    expect(said()).toBe("+€60,000 (+6.7%) vs. asking price");
  });

  it("follows the amount as it is typed and is gone when the field is empty or not a number", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    type(field("amount"), "8");
    expect(said()).toContain("−€889,992");
    type(field("amount"), "");
    expect(said()).toBe("");
    type(field("amount"), "abc");
    expect(said()).toBe("");
  });

  it("the sign of the currency stands in the field, and there is no hint with the range under it", async () => {
    await mount("house", "en");
    navigate("/#contact-offer");
    expect(form().querySelector(".contact__amount-unit")!.textContent).toBe("€");
    for (const text of [said(), form().textContent!]) expect(text).not.toMatch(/Between|445,000|2,670,000/);
    type(field("amount"), "850,000");
    expect(form().textContent).not.toMatch(/Between|445,000|2,670,000/);
  });
});

describe("the range in the error", () => {
  it("is named only for an amount outside it; no number gets the general message", async () => {
    await mount("house", "en");
    const f = reply();
    navigate("/#contact-offer");
    fillOffer();
    type(field("amount"), "5");
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).toMatch(/€445,000.*€2,670,000/);
    type(field("amount"), "abc");
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).not.toMatch(/445,000|2,670,000/);
    expect(errors().join("|")).toContain(ui("contact.error.invalid", "en"));
    type(field("amount"), "9,000,000");
    await send();
    expect(errors().join("|")).toMatch(/€445,000.*€2,670,000/);
  });
});
