// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import type { ContactElement } from "@/components/ContactSection";
import { getFormSnapshot, resetFormSnapshotForTests, SNAPSHOT_MESSAGE_MAX, updateFormSnapshot } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let box: HTMLDivElement | undefined;
function mount(lang: "de" | "en" = "en") {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang)} />));
}
beforeEach(() => resetFormSnapshotForTests());
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

const section = () => box!.querySelector("#contact") as ContactElement;
const form = () => box!.querySelector("dialog.contact-dialog form.contact__form") as HTMLFormElement;
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const check = (el: HTMLInputElement) => act(() => void el.click());
const fillValid = () => {
  type(field("name"), "Test Person");
  type(field("email"), "person@example.invalid");
  check(field("consent"));
};

describe("form snapshot store", () => {
  it("starts empty, hands out copies and cuts the message to 300 characters", () => {
    const s = getFormSnapshot();
    expect(s).toMatchObject({ name: "", email: "", message: "", consentGiven: false, valid: false, dialogOpen: false, everOpened: false, language: null, preferredSlots: [] });
    s.name = "changed outside";
    expect(getFormSnapshot().name).toBe("");
    updateFormSnapshot({ message: "x".repeat(SNAPSHOT_MESSAGE_MAX + 50) });
    expect(getFormSnapshot().message).toHaveLength(SNAPSHOT_MESSAGE_MAX);
  });

  it("is updated by the form on every change: values, language, consent and validity", () => {
    mount("de");
    expect(getFormSnapshot()).toMatchObject({ language: "de", valid: false });
    act(() => section().open());
    type(field("name"), "Test Person");
    expect(getFormSnapshot()).toMatchObject({ name: "Test Person", valid: false, consentGiven: false });
    type(field("email"), "person@example.invalid");
    type(field("phone"), "+43 1 000 000");
    type(field("channel"), "phone");
    type(field("bestTime"), "mornings");
    check(field("consent"));
    expect(getFormSnapshot()).toMatchObject({ email: "person@example.invalid", phone: "+43 1 000 000", preferredChannel: "phone", bestTime: "mornings", consentGiven: true, valid: true, requestType: "question" });
    type(field("email"), "not an address");
    expect(getFormSnapshot().valid).toBe(false);
    type(field("message"), "y".repeat(500));
    expect(getFormSnapshot().message).toHaveLength(300);
  });

  it("tracks dialogOpen and everOpened; closing the dialog clears nothing", () => {
    mount();
    expect(getFormSnapshot()).toMatchObject({ dialogOpen: false, everOpened: false });
    act(() => section().open());
    expect(getFormSnapshot()).toMatchObject({ dialogOpen: true, everOpened: true });
    fillValid();
    act(() => section().close());
    expect(getFormSnapshot()).toMatchObject({ dialogOpen: false, everOpened: true, name: "Test Person", email: "person@example.invalid", consentGiven: true, valid: true });
  });

  it("is not cleared by a successful submit (the form is emptied, the snapshot is not)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })));
    mount();
    act(() => section().open());
    fillValid();
    await act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(box!.querySelector(".contact__success")).not.toBeNull();
    expect(getFormSnapshot()).toMatchObject({ name: "Test Person", email: "person@example.invalid", consentGiven: true, valid: true });
  });

  it("is never persisted or logged", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    window.localStorage.clear();
    mount();
    act(() => section().open());
    fillValid();
    type(field("message"), "a private sentence");
    act(() => section().close());
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toMatch(/Test Person|person@example|private sentence/);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
    spies.forEach((s) => s.mockRestore());
  });
});
