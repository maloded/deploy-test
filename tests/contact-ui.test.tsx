// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { getFormSnapshot, resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { EXAMPLES_DIR, FIXTURE_DIR, examples, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";
import { chipOf, chooseChannel, chooseType, clickEl, pickSlot, selectedChannel, selectedType, tabOf, tabTypes } from "./form-ui";

// The dialog's behaviour as the reference site has it, in this site's own style: tabs, channel chips that wait for what they need, the agent's hints, the success screen
// with the request number and "another request", and a phone's keyboard.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
/** "house": viewing, question, offer (Tue, Thu, Sat, 10:00 to 16:00; 890,000 EUR); "car": question and offer (589 EUR). */
async function mount(which: "car" | "house" = "car", lang: "en" | "de" = "en") {
  const site = which === "car" ? buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang) : buildSite(null, examples.ref("example-house"), EXAMPLES_DIR, lang);
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: AGENT } as any }} />));
}
beforeEach(() => {
  resetFormSnapshotForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
  window.location.hash = "";
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

const section = () => box!.querySelector("#contact") as any;
const form = () => box!.querySelector("dialog form") as HTMLFormElement;
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  return call.answers[0] as Record<string, any>;
};
const key = (el: Element, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
const send = () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const reply = (id = "AB12CD34") => {
  const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const agentOpens = (path = "/#contact-question") => {
  const w = fakeWidget();
  document.dispatchEvent(new Event("call-start"));
  act(() => void w.command("navigate", { path }));
  w.remove();
};

describe("the tabs", () => {
  it("are a tablist: one tab stop, the chosen tab selected; the arrows, Home and End move to the neighbour, which is chosen at once, with the focus on it", async () => {
    await mount("house");
    act(() => section().open());
    const list = form().querySelector("[role=tablist]")!;
    expect(tabTypes(box!)).toEqual(["viewing", "question", "offer"]);
    expect(selectedType(box!)).toBe("question");
    act(() => tabOf(box!, "question")!.focus());
    key(list, "ArrowRight");
    expect(selectedType(box!)).toBe("offer");
    expect(document.activeElement).toBe(tabOf(box!, "offer"));
    key(list, "ArrowRight"); // wraps
    expect(selectedType(box!)).toBe("viewing");
    expect(document.activeElement).toBe(tabOf(box!, "viewing"));
    key(list, "ArrowLeft"); // and back
    expect(selectedType(box!)).toBe("offer");
    key(list, "Home");
    expect(selectedType(box!)).toBe("viewing");
    key(list, "End");
    expect(selectedType(box!)).toBe("offer");
    key(list, "a"); // any other key does nothing
    expect(selectedType(box!)).toBe("offer");
    expect(tabOf(box!, "offer")!.tabIndex).toBe(0);
    expect(tabOf(box!, "viewing")!.tabIndex).toBe(-1);
    expect(form().querySelector("[role=tabpanel]")!.getAttribute("aria-labelledby")).toBe(tabOf(box!, "offer")!.id);
  });

  it("keep what was typed when the type changes", async () => {
    await mount("house");
    act(() => section().open());
    type(field("name"), "Typed Name");
    type(field("email"), "typed@example.invalid");
    chooseType(box!, "offer");
    chooseType(box!, "viewing");
    expect(field("name").value).toBe("Typed Name");
    expect(field("email").value).toBe("typed@example.invalid");
  });

  it("are in the order of the product's types, with the labels of the page language (de)", async () => {
    await mount("house", "de");
    expect([...box!.querySelectorAll("dialog [role=tab]")].map((t) => t.textContent)).toEqual(["Besichtigung", "Frage", "Angebot machen"]);
  });
});

describe("the channel chips", () => {
  const fill = (what: Record<string, string>) => {
    for (const [name, value] of Object.entries(what)) type(field(name), value);
  };

  it("no preference is always usable; e-mail needs a valid e-mail address; phone, WhatsApp and Telegram a valid phone number", async () => {
    await mount();
    act(() => section().open());
    const off = (c: string) => chipOf(box!, c)!.getAttribute("aria-disabled") === "true";
    expect([off(""), off("email"), off("phone"), off("whatsapp"), off("telegram")]).toEqual([false, true, true, true, true]);
    fill({ email: "broken" });
    expect(off("email")).toBe(true); // not an address
    fill({ email: "person@example.invalid" });
    expect([off("email"), off("phone")]).toEqual([false, true]);
    fill({ phone: "abc" });
    expect(off("phone")).toBe(true); // not a number
    fill({ phone: "+00 000 000 000" });
    expect([off("phone"), off("whatsapp"), off("telegram")]).toEqual([false, false, false]);
    expect(selectedChannel(box!)).toBe(""); // "no preference" stays the choice until another is pressed
  });

  it("a chip that cannot be used yet is not chosen when pressed: it says what to enter first (in German: Erst E-Mail eintragen / Erst Telefonnummer eintragen)", async () => {
    await mount("car", "de");
    act(() => section().open());
    chooseChannel(box!, "email");
    expect(selectedChannel(box!)).toBe("");
    expect(form().querySelector("[role=status]")!.textContent).toBe("Erst E-Mail eintragen");
    chooseChannel(box!, "whatsapp");
    expect(selectedChannel(box!)).toBe("");
    expect(form().querySelector("[role=status]")!.textContent).toBe("Erst Telefonnummer eintragen");
    type(field("phone"), "+00 000 000 000"); // now it has what it needs: the hint goes
    expect(form().querySelector("[role=status]")).toBeNull();
    chooseChannel(box!, "whatsapp");
    expect(selectedChannel(box!)).toBe("whatsapp");
  });

  it("falls back to no preference, live, when what the chosen channel needs is gone", async () => {
    await mount();
    act(() => section().open());
    fill({ email: "person@example.invalid", phone: "+00 000 000 000" });
    chooseChannel(box!, "phone");
    expect(selectedChannel(box!)).toBe("phone");
    fill({ phone: "" });
    expect(selectedChannel(box!)).toBe(""); // the number went: no preference again
    expect(getFormSnapshot().preferredChannel).toBe("");
    chooseChannel(box!, "email");
    fill({ email: "person@example" });
    expect(selectedChannel(box!)).toBe("");
    // the e-mail channel needs the address, not the phone: clearing the phone leaves it
    fill({ email: "person@example.invalid", phone: "+00 000 000 000" });
    chooseChannel(box!, "email");
    fill({ phone: "" });
    expect(selectedChannel(box!)).toBe("email");
  });

  it("the contact window chips are hidden for the e-mail channel (the e-mail rule stays) and a window is a pressed chip", async () => {
    await mount();
    act(() => section().open());
    fill({ email: "person@example.invalid" });
    expect(form().querySelectorAll(".contact__chip[data-window]").length).toBeGreaterThan(1);
    clickEl(form().querySelector(".contact__chip[data-window=morning]"));
    expect(form().querySelector(".contact__chip[data-window=morning]")!.getAttribute("aria-pressed")).toBe("true");
    expect(form().querySelector(".contact__chip[data-window=anytime]")!.getAttribute("aria-pressed")).toBe("false");
    chooseChannel(box!, "email");
    expect(form().querySelector(".contact__chip[data-window]")).toBeNull();
  });
});

describe("the agent's form", () => {
  it("has the 'optional, arrange it with the agent in the call' hint on the times, the amount and the question, and a send button that is there and usable", async () => {
    await mount("house", "de");
    agentOpens("/#contact-viewing");
    const hint = ui("contact.agentOptional", "de");
    expect(hint).toBe("Optional – das klären Sie mit Sofia im Gespräch.");
    expect(form().querySelector(".contact__slots")!.textContent).toContain(hint);
    chooseType(box!, "offer");
    expect(form().querySelector("[name=amount]")!.closest(".contact__field")!.textContent).toContain(hint);
    chooseType(box!, "question");
    expect(field("message").closest(".contact__field")!.textContent).toContain(hint);
    const send = form().querySelector<HTMLButtonElement>(".contact__actions button[type=submit]")!;
    expect(send.disabled).toBe(false);
    expect(send.textContent).toBe(ui("contact.submit", "de"));
    document.dispatchEvent(new Event("call-end"));
  });

  it("the send button is in a bar that stays at the bottom of the dialog while the form scrolls", async () => {
    await mount();
    act(() => section().open());
    const bar = form().querySelector(".contact__actions")!;
    expect(bar.querySelector("button[type=submit]")).not.toBeNull();
    expect(form().lastElementChild).toBe(bar);
  });
});

describe("the success screen and a new request", () => {
  const fillQuestion = () => {
    type(field("name"), "Test Person");
    type(field("phone"), "+00 000 000 000");
    type(field("message"), "A question about the car");
    act(() => void field("consent").click());
  };

  it("has the thanks, the text of the type, the request number and two buttons; 'another request' is an empty form of the same type", async () => {
    await mount("car", "de");
    reply("AB12CD34");
    act(() => section().open());
    chooseType(box!, "offer");
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    type(field("phone"), "+00 000 000 000");
    type(field("amount"), "800");
    act(() => void field("consent").click());
    await send();
    const done = box!.querySelector(".contact__success")!;
    expect(done.querySelector("h3")!.textContent).toBe("Vielen Dank");
    expect(done.textContent).toContain("Der Eigentümer prüft Ihr Angebot persönlich und meldet sich bei Ihnen.");
    expect(done.querySelector(".contact__number")!.textContent).toBe("Anfragenummer #AB12CD34");
    expect([...done.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Weitere Anfrage", "Schließen"]);
    expect(ask().form).toMatchObject({ submit: "sent", requestId: "AB12CD34", phase: "complete" });
    clickEl(done.querySelector("button"));
    expect(box!.querySelector(".contact__success")).toBeNull();
    expect(selectedType(box!)).toBe("offer"); // the same type
    for (const name of ["name", "email", "phone", "amount", "message"]) expect(field(name).value, name).toBe(""); // and nothing of the old request
    expect(field("consent").checked).toBe(false);
    expect(document.activeElement).toBe(field("amount")); // the first field this type still needs
    // page_context after "another request": nothing of the sent one is left
    const a = ask();
    expect(a.form).toEqual({ phase: "open_filling", type: "offer", missing: ["amount", "name", "email", "phone", "consent"], consent: false, visible: true, submit: "none" });
    expect(JSON.stringify(a)).not.toMatch(/AB12CD34|Test Person|example\.invalid|800/);
  });

  it("the texts: a question's, a viewing's (we will confirm a time), an offer's, in the page language; the number is shown whatever the type", async () => {
    await mount("house", "en");
    reply("0A0A0A0A");
    act(() => section().open());
    fillQuestion();
    await send();
    expect(box!.querySelector(".contact__success")!.textContent).toContain(ui("contact.success.text", "en"));
    expect(box!.querySelector(".contact__number")!.textContent).toBe("Request number #0A0A0A0A");
  });

  it("without a number in the answer none is shown; 'close' closes the dialog", async () => {
    await mount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })));
    act(() => section().open());
    fillQuestion();
    await send();
    expect(box!.querySelector(".contact__number")).toBeNull();
    clickEl(box!.querySelector(".contact__success-actions button:last-child"));
    expect(box!.querySelector("dialog[open]")).toBeNull();
  });

  it("a link or button of the page after a send starts a new request of its type (an empty form), and the agent's page_context says so", async () => {
    await mount();
    reply();
    act(() => section().open());
    fillQuestion();
    await send();
    expect(ask().form.submit).toBe("sent");
    clickEl(box!.querySelector(".contact__success-actions button:last-child")); // close
    const link = box!.querySelector<HTMLAnchorElement>('footer a[data-request-type="offer"]')!;
    clickEl(link);
    expect(selectedType(box!)).toBe("offer");
    expect(field("name").value).toBe("");
    expect(box!.querySelector(".contact__success")).toBeNull();
    expect(ask().form).toMatchObject({ phase: "open_filling", type: "offer", submit: "none", consent: false });
    expect(ask().form).not.toHaveProperty("requestId");
  });

  it("a second request can be sent after the first, with its own number", async () => {
    await mount();
    const f = reply("AAAA1111");
    act(() => section().open());
    fillQuestion();
    await send();
    clickEl(box!.querySelector(".contact__success-actions button"));
    fillQuestion();
    f.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: true, id: "BBBB2222" }), { status: 200, headers: { "content-type": "application/json" } }));
    await send();
    expect(box!.querySelector(".contact__number")!.textContent).toContain("#BBBB2222");
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("a phone's keyboard", () => {
  it("the dialog is as tall as what the on-screen keyboard leaves (the visual viewport), and gives it back when closed", async () => {
    const listeners: Record<string, () => void> = {};
    const vv = { height: 420, addEventListener: (n: string, cb: () => void) => (listeners[n] = cb), removeEventListener: vi.fn() };
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    await mount();
    act(() => section().open());
    const dialog = box!.querySelector("dialog") as HTMLElement;
    expect(dialog.style.getPropertyValue("--contact-vv")).toBe("420px");
    vv.height = 300;
    act(() => listeners.resize());
    expect(dialog.style.getPropertyValue("--contact-vv")).toBe("300px");
    act(() => section().close());
    expect(dialog.style.getPropertyValue("--contact-vv")).toBe("");
    delete (window as any).visualViewport;
  });

  it("a field that gets focus is scrolled into view once the keyboard is up; a reduced-motion visitor gets it without the animation", async () => {
    vi.useFakeTimers();
    const scrolled = vi.fn();
    (Element.prototype as any).scrollIntoView = scrolled;
    await mount();
    act(() => section().open());
    act(() => void vi.advanceTimersByTime(1000));
    scrolled.mockClear();
    act(() => field("message").focus());
    expect(scrolled).not.toHaveBeenCalled(); // not at once: the keyboard is still coming up
    act(() => void vi.advanceTimersByTime(350));
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toBe(field("message"));
    expect(scrolled.mock.calls[0][0]).toMatchObject({ block: "nearest", behavior: "smooth" });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    act(() => field("name").focus());
    act(() => void vi.advanceTimersByTime(350));
    expect(scrolled.mock.calls.at(-1)![0]).toMatchObject({ behavior: "auto" }); // reduced motion: no animation
    delete (Element.prototype as any).scrollIntoView;
  });
});

describe("the picker on a phone", () => {
  it("keeps what is picked when the day shown changes, and marks the days with a picked time", async () => {
    await mount("house");
    act(() => section().open());
    chooseType(box!, "viewing");
    pickSlot(box!, "2026-06-11", "10:00");
    pickSlot(box!, "2026-06-13", "12:00");
    clickEl(form().querySelector('.contact__day[data-day="2026-06-11"]'));
    expect(form().querySelector('.contact__time[data-time="10:00"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(form().querySelector('.contact__time[data-time="12:00"]')!.getAttribute("aria-pressed")).toBe("false");
    expect(form().querySelectorAll(".contact__dot")).toHaveLength(2);
  });
});
