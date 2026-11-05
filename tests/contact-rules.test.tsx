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
import { chooseType } from "./form-ui";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
/** The fixture car costs 589 (offers from 295 to 1,767; question and offer only); the example house 890,000 (viewing too). */
async function mount(which: "car" | "house" = "car", lang: "en" | "de" = "en") {
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
const form = () => box!.querySelector("dialog.contact-dialog form") as HTMLFormElement;
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const check = () => act(() => void field("consent").click());
const send = () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const reply = (body: unknown = { ok: true, id: "ABCD1234" }, status = 200) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const sent = (f: ReturnType<typeof reply>) => JSON.parse((f.mock.calls as any)[0][1].body);
const errors = () => [...form().querySelectorAll(".contact__summary li")].map((li) => li.textContent);
/** The agent leads the visitor to the form: the widget says a call started, then navigates to #contact. */
const agentOpens = (callRunning = true) => {
  const w = fakeWidget();
  if (callRunning) document.dispatchEvent(new Event("call-start"));
  act(() => void w.command("navigate", { path: "/#contact" }));
  w.remove();
  if (callRunning) document.dispatchEvent(new Event("call-end"));
};

describe("phone or e-mail", () => {
  it("a question with a phone number only is sent: no e-mail needed, and both fields say 'phone or e-mail' instead of optional", async () => {
    await mount();
    const f = reply();
    act(() => section().open());
    const labels = [...form().querySelectorAll("label")].map((l) => l.textContent);
    expect(labels.find((t) => t?.startsWith(ui("contact.email", "en")))).toContain(ui("contact.either", "en"));
    expect(labels.find((t) => t?.startsWith(ui("contact.phone", "en")))).toContain(ui("contact.either", "en"));
    type(field("name"), "Test Person");
    type(field("phone"), "+00 000 000 000");
    type(field("message"), "A question about the car");
    check();
    await send();
    expect(f).toHaveBeenCalledTimes(1);
    expect(sent(f)).toMatchObject({ name: "Test Person", phone: "+00 000 000 000", requestType: "question", source: "form" });
    expect(sent(f).email).toBe("");
  });

  it("neither phone nor e-mail: nothing is sent and the summary names both", async () => {
    await mount();
    const f = reply();
    act(() => section().open());
    type(field("name"), "Test Person");
    type(field("message"), "A question about the car");
    check();
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).toContain(ui("contact.error.phoneOrEmail", "en"));
    expect(errors()).toHaveLength(2); // e-mail and phone
    type(field("email"), "person@example.invalid"); // one of them is enough
    await send();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a broken phone number is refused even when the e-mail is fine", async () => {
    await mount();
    const f = reply();
    act(() => section().open());
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    type(field("phone"), "abc");
    type(field("message"), "A question about the car");
    check();
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).toContain(ui("contact.error.phone", "en"));
  });

  it("the question is required on the web", async () => {
    await mount();
    const f = reply();
    act(() => section().open());
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    check();
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).toContain(ui("contact.message", "en"));
    expect(field("message").required).toBe(true);
  });
});

describe("an offer: phone, e-mail and an amount inside the product's range", () => {
  const fillOffer = (amount: string) => {
    act(() => section().open());
    chooseType(box!, "offer");
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    type(field("phone"), "+00 000 000 000");
    type(field("amount"), amount);
    check();
  };

  it("shows the amount field, in the product's currency, only for an offer; no range is printed under it", async () => {
    await mount();
    act(() => section().open());
    expect(form().querySelector("[name=amount]")).toBeNull();
    chooseType(box!, "offer");
    expect(field("amount")).toBeTruthy();
    expect(form().querySelector(".contact__amount-unit")!.textContent).toBe("€");
    expect(form().textContent).not.toMatch(/295|1,767/); // the range stays a rule: it is named in the error of an amount outside it (see offer-prefill.test.tsx)
  });

  it("reads the amount by the page language: English '1,000' and '800.5', German '1.000' and '800,5'; both send a number", async () => {
    for (const [lang, typed, number] of [["en", "800", 800], ["en", "1,000", 1000], ["en", "800.5", 800.5], ["en", "1 000", 1000], ["de", "800", 800], ["de", "1.000", 1000], ["de", "800,5", 800.5]] as const) {
      await mount("car", lang);
      const f = reply();
      fillOffer(typed);
      await send();
      expect(sent(f), `${lang} ${typed}`).toMatchObject({ requestType: "offer", amount: number, lang });
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
      resetFormSnapshotForTests();
    }
  });

  it("an English visitor who writes '1.000' means one: 1 is below the range; a German visitor who writes '1,000' means one too", async () => {
    for (const [lang, typed] of [["en", "1.000"], ["de", "1,000"]] as const) {
      await mount("car", lang);
      const f = reply();
      fillOffer(typed);
      await send();
      expect(f, `${lang} ${typed}`).not.toHaveBeenCalled();
      expect(errors().join("|")).toMatch(/295/);
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
      resetFormSnapshotForTests();
    }
  });

  it("shows the amount back as the language writes it once the field loses focus, without counting as an edit when nothing changes", async () => {
    await mount("house", "en");
    act(() => section().open());
    chooseType(box!, "offer");
    type(field("amount"), "500000");
    act(() => {
      field("amount").focus();
      field("amount").blur();
    });
    expect(field("amount").value).toBe("500,000");
    type(field("amount"), "49500.5");
    act(() => {
      field("amount").focus();
      field("amount").blur();
    });
    expect(field("amount").value).toBe("49,500.5");
    act(() => root!.unmount());
    box!.remove();
    root = box = undefined;
    await mount("house", "de");
    act(() => section().open());
    chooseType(box!, "offer");
    type(field("amount"), "500000");
    act(() => {
      field("amount").focus();
      field("amount").blur();
    });
    expect(field("amount").value).toBe("500.000");
    type(field("amount"), "49500,5");
    act(() => {
      field("amount").focus();
      field("amount").blur();
    });
    expect(field("amount").value).toBe("49.500,5");
  });

  it("an amount outside the range, or not a number, is refused with the range in the message; none is needed to look at the field", async () => {
    await mount();
    const f = reply();
    fillOffer("5");
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).toContain("295");
    expect(errors().join("|")).toContain("1,767");
    type(field("amount"), "2.000.000");
    await send();
    expect(f).not.toHaveBeenCalled();
    type(field("amount"), "abc");
    await send();
    expect(f).not.toHaveBeenCalled();
    type(field("amount"), "");
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(errors().join("|")).toContain(ui("contact.amount", "en"));
  });

  it("the snapshot the agent can read has the amount as typed, the missing field is named, and a range error blocks 'complete'", async () => {
    await mount();
    act(() => section().open());
    chooseType(box!, "offer");
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    type(field("phone"), "+00 000 000 000");
    check();
    expect(getFormSnapshot().missing).toEqual(["amount"]);
    type(field("amount"), "5");
    expect(getFormSnapshot()).toMatchObject({ amount: "5", valid: false, missing: ["amount"] }); // outside 295 to 1,767
    type(field("amount"), "800");
    expect(getFormSnapshot()).toMatchObject({ amount: "800", valid: true, missing: [] });
  });
});

describe("the voice assistant opens the form during a call", () => {
  it("the request says so (source agent) and the question is optional: name, contact and consent are still needed", async () => {
    await mount();
    const f = reply();
    agentOpens();
    expect(form().textContent).toContain(ui("contact.agentOptional", "en"));
    expect(field("message").required).toBe(false);
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    await send(); // no consent yet
    expect(f).not.toHaveBeenCalled();
    check();
    await send();
    expect(sent(f)).toMatchObject({ source: "agent", requestType: "question", name: "Test Person" });
    expect(sent(f).message).toBe(""); // empty: the server leaves it out
    expect(getFormSnapshot()).toMatchObject({ submit: "sent", requestId: "ABCD1234" }); // the request number the API answered
  });

  it("a viewing needs no time and an offer no amount from the agent's form; what is typed is still checked", async () => {
    await mount("house");
    const f = reply();
    agentOpens();
    chooseType(box!, "viewing");
    expect(form().textContent).toContain(ui("contact.agentOptional", "en"));
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    check();
    await send();
    expect(sent(f)).toMatchObject({ source: "agent", requestType: "viewing" });
    expect(sent(f).preferredSlots).toEqual([]);
    expect(getFormSnapshot().submit).toBe("sent");
  });

  it("the same page without a call, or opened by the visitor, is the web form: no agent hints, source form", async () => {
    await mount();
    const f = reply();
    agentOpens(false); // the agent navigates, but no call is running: the bridge does not mark it
    expect(form().textContent).not.toContain(ui("contact.agentOptional", "en"));
    act(() => section().close());
    document.dispatchEvent(new Event("call-start"));
    act(() => section().open()); // the visitor's own click: no options
    expect(form().textContent).not.toContain(ui("contact.agentOptional", "en"));
    type(field("name"), "Test Person");
    type(field("email"), "person@example.invalid");
    type(field("message"), "A question");
    check();
    await send();
    expect(sent(f)).toMatchObject({ source: "form" });
    document.dispatchEvent(new Event("call-end"));
  });

  it("open() accepts only {agent: true}: anything else is the visitor's open", async () => {
    await mount();
    act(() => section().open({ agent: "yes", name: "Injected" }));
    expect(form().textContent).not.toContain(ui("contact.agentOptional", "en"));
    expect(field("name").value).toBe("");
  });
});

describe("what to bring", () => {
  it("a test drive shows its own note where the seller gives one, a viewing the general note, and the general one stands in when there is no test-drive note", async () => {
    const car = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    const viewing = buildSite(null, examples.ref("example-house"), EXAMPLES_DIR, "en").viewing!;
    for (const [config, expected] of [
      [{ ...viewing, notes: { en: "General note" }, testDriveNotes: { en: "Bring a licence and an ID" } }, { viewing: "General note", testdrive: "Bring a licence and an ID" }],
      [{ ...viewing, notes: { en: "General note" }, testDriveNotes: undefined }, { viewing: "General note", testdrive: "General note" }],
      [{ ...viewing, notes: undefined, testDriveNotes: { en: "Bring a licence and an ID" } }, { viewing: null, testdrive: "Bring a licence and an ID" }],
    ] as const) {
      box = document.createElement("div");
      document.body.appendChild(box);
      root = createRoot(box);
      await act(async () => root!.render(<ProductLayout site={{ ...car, viewing: config as any }} />));
      act(() => section().open());
      for (const kind of ["viewing", "testdrive"] as const) {
        chooseType(box!, kind);
        const shown = [...form().querySelectorAll(".contact__viewing dd")].map((d) => d.textContent);
        expect(shown.includes(expected[kind] ?? "\u0000"), `${kind}: ${shown}`).toBe(expected[kind] !== null);
      }
      act(() => root!.unmount());
      box.remove();
      root = box = undefined;
    }
  });
});
