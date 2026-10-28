// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { getFormSnapshot, resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
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
});

describe("the agent can open and close the dialog and read the answer, nothing else", () => {
  it("no command writes a field, prefills, ticks the consent or submits", async () => {
    const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" } } as any }} />));
    const contact = box.querySelector("#contact") as any;
    act(() => contact.open());
    const before = getFormSnapshot();
    const w = fakeWidget();
    const payloads = [{ field: "name", value: "Injected" }, { name: "Injected", email: "x@example.invalid", consent: true }, { path: "/#contact" }, undefined];
    for (const type of ["set_field", "setField", "prefill", "fill_form", "set_consent", "submit", "show_form", "form_response", "update_form"]) {
      for (const payload of payloads) expect(w.command(type, payload), type).toMatchObject({ handled: false, answers: [] });
    }
    w.remove();
    expect(getFormSnapshot()).toEqual(before);
    expect((box.querySelector("dialog [name=name]") as HTMLInputElement).value).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
    // the page API on the contact element is still exactly open and close, and nothing is added to the window
    expect(Object.keys(contact).filter((k) => typeof contact[k] === "function").sort()).toEqual(["close", "open"]);
    for (const name of ["setField", "prefill", "getFormState", "setConsent"]) expect((window as any)[name], name).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("the bridge code only reads the snapshot: it never imports the form model or writes the store", () => {
    for (const file of ["agent-bridge.ts", "agent-context.ts"]) {
      const code = fs.readFileSync(path.join(process.cwd(), "src", "lib", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/contact-model|updateFormSnapshot|setField|prefill|\.submit\(|requestSubmit|localStorage|sessionStorage|document\.cookie|console\./);
    }
    const widget = fs.readFileSync(path.join(process.cwd(), "src", "components", "AgentWidget.tsx"), "utf8");
    expect(widget).not.toMatch(/updateFormSnapshot|contact-model/);
  });
});
