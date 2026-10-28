// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { buildPageContext } from "@/lib/agent-context";
import { getFormSnapshot, resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { examples } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
const NAME = "Zed Quillfeather";
const EMAIL = "zed.quillfeather@example.invalid";
let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount() {
  const site = buildSite(null, examples.ref("example-house"), examples.root, "en"); // fake viewing settings: Tue, Thu, Sat, 10:00 to 16:00
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: AGENT } as any }} />));
}
// Wednesday 10 June 2026, 12:00 in Vienna. Only Date is faked.
beforeEach(() => {
  resetFormSnapshotForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.style.overflow = "";
  vi.useRealTimers();
});

const section = () => box!.querySelector("#contact") as any;
const field = (name: string) => box!.querySelector(`dialog form [name=${name}]`) as HTMLInputElement;
const slotRow = () => box!.querySelector(".contact__slot") as HTMLElement;
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
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
  return call.answers[0] as Record<string, any>;
};
const setSlot = (date: string, time: string) => {
  type(slotRow().querySelector("input[type=date]") as HTMLInputElement, date);
  type(slotRow().querySelector("select") as HTMLSelectElement, time);
};

describe("page_context: missing", () => {
  it("lists the names of the blocking fields in page order, in every phase but complete", async () => {
    await mount();
    expect(ask()).toMatchObject({ phase: "not_opened", missing: ["name", "email", "consent"] });
    act(() => section().open());
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["name", "email", "consent"] });
    type(field("name"), NAME);
    expect(ask().missing).toEqual(["email", "consent"]);
    type(field("email"), EMAIL);
    expect(ask().missing).toEqual(["consent"]);
    check(field("consent"));
    expect(ask()).toMatchObject({ phase: "complete", missing: [] });
  });

  it("an empty required field with the rest filled gives open_filling and exactly that name", async () => {
    await mount();
    act(() => section().open());
    type(field("email"), EMAIL);
    check(field("consent"));
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["name"] });
  });

  it("an invalid e-mail counts as a blocking field; closing it gives incomplete with the same name", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    type(field("email"), "broken");
    check(field("consent"));
    expect(ask().missing).toEqual(["email"]);
    act(() => section().close());
    expect(ask()).toMatchObject({ phase: "incomplete", missing: ["email"] });
  });

  it("consent unticked: open_filling while open, no_consent when closed, both with missing [consent]", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    type(field("email"), EMAIL);
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["consent"] });
    act(() => section().close());
    expect(ask()).toMatchObject({ phase: "no_consent", missing: ["consent"] });
  });

  it("a viewing request without a slot names preferredSlots; with a name missing too, both come in one answer", async () => {
    await mount();
    act(() => section().open());
    type(field("requestType"), "viewing");
    type(field("email"), EMAIL);
    check(field("consent"));
    expect(ask().missing).toEqual(["preferredSlots", "name"]);
    type(field("name"), NAME);
    expect(ask().missing).toEqual(["preferredSlots"]);
  });

  it("a complete slot row that the slot rules refuse (a past day, a day without visits) names preferredSlots; a good one does not", async () => {
    await mount();
    act(() => section().open());
    type(field("requestType"), "viewing");
    type(field("name"), NAME);
    type(field("email"), EMAIL);
    check(field("consent"));
    setSlot("2026-06-09", "10:00"); // yesterday
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["preferredSlots"] });
    setSlot("2026-06-12", "10:00"); // a Friday: no visits
    expect(ask().missing).toEqual(["preferredSlots"]);
    setSlot("2026-06-11", "10:00"); // Thursday
    expect(ask()).toMatchObject({ phase: "complete", missing: [] });
  });

  it("carries names only: no typed value, no reason, no field content", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    type(field("email"), "broken-" + "Quillfeather");
    const text = JSON.stringify(ask());
    for (const secret of [NAME, "Quillfeather", "broken"]) expect(text).not.toContain(secret);
    expect(ask().missing.every((m: unknown) => typeof m === "string" && /^[a-zA-Z]+$/.test(m as string))).toBe(true);
  });

  it("stays in the cut-down answer (AGENT_INCLUDE_FORM off): names only are allowed there", () => {
    const snapshot = { ...getFormSnapshot(), everOpened: true, missing: ["email", "consent"] as any };
    expect(buildPageContext({ language: "en", product: "p", path: "/", title: "t", snapshot }, false)).toMatchObject({ missing: ["email", "consent"], submit: "none" });
  });
});
