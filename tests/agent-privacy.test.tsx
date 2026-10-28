// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { UI_KEYS, ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

let root: Root | undefined;
let box: HTMLDivElement | undefined;
beforeEach(() => resetFormSnapshotForTests());
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

describe("nothing the visitor typed is written anywhere but the answer", () => {
  it("no console output carries a value, in any phase, and nothing is stored in the browser", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    window.localStorage.clear();
    window.sessionStorage.clear();
    const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" } } as any }} />));
    const w = fakeWidget();
    const contact = box.querySelector("#contact") as any;
    const field = (n: string) => box!.querySelector(`dialog form [name=${n}]`) as HTMLInputElement;
    const type = (el: HTMLInputElement, value: string) =>
      act(() => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    w.command("page_context");
    act(() => void w.command("navigate", { path: "/#contact" }));
    type(field("name"), "Zed Quillfeather");
    type(field("email"), "zed.quillfeather@example.invalid");
    type(field("message"), "a private sentence about the second row");
    w.command("page_context");
    act(() => void field("consent").click());
    w.command("page_context");
    w.command("cart_state");
    w.command("set_field", { field: "name", value: "Injected Name" });
    act(() => contact.close());
    w.command("page_context");
    w.remove();
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Quillfeather|private sentence|Injected/);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });
});

describe("agent strings", () => {
  it("every agent.* string exists in German and English and is not empty", () => {
    const keys = UI_KEYS.filter((k) => k.startsWith("agent."));
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const key of keys) for (const lang of ["de", "en"] as const) expect(ui(key, lang).trim().length, `${key} ${lang}`).toBeGreaterThan(0);
    for (const key of keys) expect(ui(key, "de"), key).not.toBe(ui(key, "en"));
  });
});
