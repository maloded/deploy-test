// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
const PRODUCT = `${fixtures.seller}/fixture-car`;
let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount() {
  const site = buildSite(null, PRODUCT, FIXTURE_DIR, "en");
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
const gallery = () => box!.querySelector("#gallery") as any;
const field = (name: string) => box!.querySelector(`dialog.contact-dialog form [name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const goContact = () => {
  const w = fakeWidget();
  let call!: ReturnType<typeof w.command>;
  act(() => void (call = w.command("navigate", { path: "/#contact" })));
  w.remove();
  return call;
};

describe("navigate #contact", () => {
  it("while the dialog is already open: handled (preventDefault), nothing changes, focus is not touched, no second contact-open", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), "Typed Name");
    act(() => field("email").focus());
    const opened = vi.fn();
    section().addEventListener("contact-open", opened);
    const call = goContact();
    expect(call.handled).toBe(true);
    expect(document.activeElement).toBe(field("email"));
    expect(field("name").value).toBe("Typed Name");
    expect(opened).not.toHaveBeenCalled();
    expect(box!.querySelectorAll("dialog.contact-dialog[open]")).toHaveLength(1);
  });

  it("opens the dialog with focus on the Name input when every field is empty", async () => {
    await mount();
    expect(goContact().handled).toBe(true);
    expect(document.activeElement).toBe(field("name"));
  });

  it("focuses the first EMPTY required field: the e-mail once the name is typed, the consent box once both are", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), "Typed Name");
    act(() => section().close());
    goContact();
    expect(document.activeElement).toBe(field("email"));
    type(field("email"), "typed@example.invalid");
    act(() => section().close());
    goContact();
    expect(document.activeElement).toBe(field("consent"));
  });

  it("with the lightbox open: closes the lightbox first, then opens the dialog with focus on the first empty required field", async () => {
    await mount();
    act(() => gallery().openLightbox(0));
    expect(box!.querySelector("dialog.lightbox[open]")).not.toBeNull();
    const call = goContact();
    expect(call.handled).toBe(true);
    expect(box!.querySelector("dialog.lightbox")).toBeNull();
    expect(box!.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(box!.querySelector("dialog.contact-dialog[open]")).not.toBeNull();
    expect(document.activeElement).toBe(field("name")); // the lightbox's focus return did not take it back
  });
});
