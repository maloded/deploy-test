// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { AGENT_INCLUDE_FORM, buildPageContext, phaseOf, PHASES } from "@/lib/agent-context";
import { getFormSnapshot, resetFormSnapshotForTests, updateFormSnapshot } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
const PRODUCT = `${fixtures.seller}/fixture-car`;
const NAME = "Zed Quillfeather";
const EMAIL = "zed.quillfeather@example.invalid";
const MESSAGE = "Quillfeather asks about the second row";
let root: Root | undefined;
let box: HTMLDivElement | undefined;
let consentText = "";
async function mount(lang: "de" | "en" = "en") {
  const site = buildSite(null, PRODUCT, FIXTURE_DIR, lang);
  consentText = (site.seller.consentText as Record<string, string>)[lang] ?? "";
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
});

const section = () => box!.querySelector("#contact") as any;
const field = (name: string) => box!.querySelector(`dialog form [name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const check = (el: HTMLInputElement) => act(() => void el.click());
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  expect(call.handled).toBe(true);
  expect(call.answeredSynchronously).toBe(true);
  expect(call.answers).toHaveLength(1);
  return call.answers[0] as Record<string, any>;
};
const noValues = (answer: Record<string, unknown>) => {
  expect(answer).not.toHaveProperty("form");
  const text = JSON.stringify(answer);
  for (const secret of [NAME, EMAIL, "Quillfeather", MESSAGE, "+43 1 000 000", "mornings"]) expect(text).not.toContain(secret);
};
const openAndFill = () => {
  act(() => section().open());
  type(field("name"), NAME);
  type(field("email"), EMAIL);
};

describe("page_context answer: the phases", () => {
  it("not_opened: the dialog was never opened", async () => {
    await mount("de");
    const a = ask();
    expect(a).toEqual({ language: "de", product: PRODUCT, path: window.location.pathname, title: document.title, dialogOpen: false, phase: "not_opened", submit: "none", missing: ["name", "email", "consent"] });
  });

  it("open_filling: the dialog is open and the form is not complete, with or without typing", async () => {
    await mount();
    act(() => section().open());
    expect(ask()).toMatchObject({ phase: "open_filling", dialogOpen: true });
    type(field("name"), NAME);
    check(field("consent"));
    const a = ask();
    expect(a).toMatchObject({ phase: "open_filling", dialogOpen: true });
    noValues(a);
  });

  it("closed_empty: opened and closed with every field empty", async () => {
    await mount();
    act(() => section().open());
    act(() => section().close());
    const a = ask();
    expect(a).toMatchObject({ phase: "closed_empty", dialogOpen: false });
    noValues(a);
  });

  it("no_consent: closed, there are values, the consent box is not ticked", async () => {
    await mount();
    openAndFill();
    type(field("message"), MESSAGE);
    act(() => section().close());
    const a = ask();
    expect(a).toMatchObject({ phase: "no_consent", dialogOpen: false });
    noValues(a);
  });

  it("incomplete: closed, something filled in, consent ticked, the form not complete; no values", async () => {
    await mount();
    openAndFill();
    type(field("email"), "broken");
    check(field("consent"));
    act(() => section().close());
    const a = ask();
    expect(a).toMatchObject({ phase: "incomplete", dialogOpen: false });
    noValues(a);
    // the consent box alone counts as filled in
    act(() => section().open());
    type(field("name"), "");
    type(field("email"), "");
    act(() => section().close());
    expect(ask().phase).toBe("incomplete");
  });

  it("complete: valid and consented, with the dialog open or closed; the only phase with values", async () => {
    await mount();
    openAndFill();
    type(field("phone"), "+43 1 000 000");
    type(field("channel"), "phone");
    type(field("bestTime"), "mornings");
    type(field("message"), MESSAGE);
    check(field("consent"));
    for (const dialogOpen of [true, false]) {
      if (!dialogOpen) act(() => section().close());
      const a = ask();
      expect(a.phase).toBe("complete");
      expect(a.dialogOpen).toBe(dialogOpen);
      expect(a.form).toEqual({ requestType: "question", name: NAME, email: EMAIL, phone: "+43 1 000 000", preferredChannel: "phone", bestTime: "mornings", message: MESSAGE, preferredSlots: [] });
    }
  });

  it("a form that is complete and then spoilt is no longer complete and gives its values up again", async () => {
    await mount();
    openAndFill();
    check(field("consent"));
    expect(ask().phase).toBe("complete");
    type(field("email"), "broken");
    const a = ask();
    expect(a.phase).toBe("open_filling"); // the dialog is open
    noValues(a);
    act(() => section().close());
    expect(ask().phase).toBe("incomplete"); // closed, consent given, a required field invalid
    noValues(ask());
  });

  it("keeps the phase after the dialog is reopened: opened once, everOpened stays", async () => {
    await mount();
    act(() => section().open());
    act(() => section().close());
    act(() => section().open());
    expect(ask().phase).toBe("open_filling");
    act(() => section().close());
    expect(ask().phase).toBe("closed_empty");
  });

  it("never carries the consent text, the honeypot or timers, and no key beyond the documented ones", async () => {
    await mount();
    openAndFill();
    check(field("consent"));
    const a = ask();
    // "submit" and "missing" are documented keys since the form-states step (states and field names, no value)
    expect(Object.keys(a).sort()).toEqual(["dialogOpen", "form", "language", "missing", "path", "phase", "product", "submit", "title"]);
    expect(Object.keys(a.form).sort()).toEqual(["bestTime", "email", "message", "name", "phone", "preferredChannel", "preferredSlots", "requestType"]);
    const text = JSON.stringify(a);
    expect(consentText.length).toBeGreaterThan(10);
    expect(text).not.toContain(consentText);
    expect(text).not.toMatch(/website|honeypot|elapsed|consent|startedAt/i);
  });
});

describe("phaseOf and buildPageContext", () => {
  const base = getFormSnapshot();
  it("covers exactly the six phases", () => {
    expect([...PHASES]).toEqual(["not_opened", "open_filling", "closed_empty", "no_consent", "incomplete", "complete"]);
    expect(phaseOf({ ...base, everOpened: true, dialogOpen: false, consentGiven: true, valid: false, name: "x" })).toBe("incomplete");
    expect(phaseOf({ ...base, everOpened: true, dialogOpen: true, consentGiven: true, valid: false, name: "x" })).toBe("open_filling");
    expect(phaseOf({ ...base, everOpened: true, dialogOpen: false, consentGiven: false, valid: false, name: "x" })).toBe("no_consent");
    expect(phaseOf({ ...base, everOpened: true, consentGiven: true, valid: true, name: "x" })).toBe("complete");
  });

  it("switching 'form' off cuts only the form key: language, dialogOpen, phase, submit and missing stay", () => {
    expect(AGENT_INCLUDE_FORM).toBe(true);
    const done = { ...base, everOpened: true, consentGiven: true, valid: true, name: NAME, email: EMAIL };
    const input = { language: "en", product: PRODUCT, path: "/en", title: "T", snapshot: done };
    expect(buildPageContext(input, false)).toEqual({ language: "en", product: PRODUCT, path: "/en", title: "T", dialogOpen: false, phase: "complete", submit: "none", missing: [] });
    expect(buildPageContext({ ...input, snapshot: { ...done, dialogOpen: true } }, false)).toEqual({ language: "en", product: PRODUCT, path: "/en", title: "T", dialogOpen: true, phase: "complete", submit: "none", missing: [] });
    expect(buildPageContext({ ...input, snapshot: base }, false)).toEqual({ language: "en", product: PRODUCT, path: "/en", title: "T", dialogOpen: false, phase: "not_opened", submit: "none", missing: ["name", "email", "consent"] });
    expect(buildPageContext(input)).toHaveProperty("form");
  });

  it("the answer is a copy: changing it does not change the store", () => {
    updateFormSnapshot({ everOpened: true, consentGiven: true, valid: true, name: "A", preferredSlots: [{ date: "2030-01-01", time: "10:00" }] });
    const a = buildPageContext({ language: "en", product: PRODUCT, path: "/", title: "t", snapshot: getFormSnapshot() }) as any;
    a.form.name = "changed";
    a.form.preferredSlots[0].time = "99:99";
    expect(getFormSnapshot()).toMatchObject({ name: "A", preferredSlots: [{ date: "2030-01-01", time: "10:00" }] });
  });
});
