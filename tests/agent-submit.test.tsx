// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
const PRODUCT = `${fixtures.seller}/fixture-car`;
const NAME = "Zed Quillfeather";
const EMAIL = "zed.quillfeather@example.invalid";
let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount(lang: "de" | "en" = "en") {
  const site = buildSite(null, PRODUCT, FIXTURE_DIR, lang);
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
const field = (name: string) => box!.querySelector(`dialog form [name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  return call.answers[0] as Record<string, any>;
};
const reply = (status: number | null) =>
  vi.stubGlobal("fetch", vi.fn(async () => (status === null ? Promise.reject(new TypeError("offline")) : new Response(JSON.stringify({ ok: status === 200 }), { status, headers: { "content-type": "application/json" } }))));
const fillAll = () => {
  act(() => section().open());
  type(field("name"), NAME);
  type(field("email"), EMAIL);
  act(() => void field("consent").click());
};
const send = () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

describe("page_context: submit", () => {
  it("is none before anything is sent, in every phase", async () => {
    await mount();
    expect(ask()).toMatchObject({ phase: "not_opened", submit: "none" });
    act(() => section().open());
    expect(ask()).toMatchObject({ phase: "open_filling", submit: "none" });
    fillAll();
    expect(ask()).toMatchObject({ phase: "complete", submit: "none" }); // complete without send
  });

  it("sent: the lead API answered success; the phase stays complete and the values stay", async () => {
    await mount();
    reply(200);
    fillAll();
    await send();
    const a = ask();
    expect(a.submit).toBe("sent");
    expect(a.phase).toBe("complete");
    expect(a.form).toMatchObject({ name: NAME, email: EMAIL });
  });

  it("sent stays sent when the dialog is closed and reopened: the success panel replaces the form, so there is nothing to edit", async () => {
    await mount();
    reply(200);
    fillAll();
    await send();
    act(() => section().close());
    act(() => section().open());
    expect(field("name")).toBeNull();
    expect(ask()).toMatchObject({ submit: "sent", phase: "complete" });
  });

  it("failed 503 keeps the values, reports submit failed, and the visitor's next edit resets it", async () => {
    await mount();
    reply(503);
    fillAll();
    await send();
    const a = ask();
    expect(a).toMatchObject({ submit: "failed", phase: "complete" });
    expect(a.form).toMatchObject({ name: NAME, email: EMAIL });
    expect(field("name").value).toBe(NAME);
    type(field("name"), "Edited");
    expect(ask().submit).toBe("none");
  });

  it.each([
    ["a 503", 503, "unavailable"],
    ["a network failure", null, "unavailable"],
    ["a 422 (too fast)", 422, "tooFast"],
    ["a 400", 400, "invalid"],
    ["a 429", 429, "rate"],
  ] as const)("%s: submit failed and its own message", async (_label, status, kind) => {
    await mount();
    reply(status);
    fillAll();
    await send();
    expect(ask().submit).toBe("failed");
    const summary = form().querySelector(".contact__summary")!;
    const mail = (summary.querySelector("a") !== null);
    expect(mail).toBe(kind === "unavailable" || kind === "rate");
    expect(summary.textContent).toContain(ui(`contact.error.${kind}` as any, "en").split("{email}")[0]);
  });

  it("a send that never left the page (client-side validation) leaves submit at none", async () => {
    await mount();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    act(() => section().open());
    await send();
    expect(f).not.toHaveBeenCalled();
    expect(ask().submit).toBe("none");
  });
});
