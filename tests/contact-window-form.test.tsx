// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests, getFormSnapshot } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, examples, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
type Site = ReturnType<typeof buildSite>;
const house = (lang: "de" | "en") => buildSite(null, examples.ref("example-house"), examples.root, lang); // viewing settings in Europe/Vienna
const car = (lang: "de" | "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang); // no viewing settings, no time zone
async function mount(site: Site) {
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const section = () => box!.querySelector("#contact") as any;
const form = () => box!.querySelector("dialog.contact-dialog form") as HTMLFormElement;
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLSelectElement & HTMLInputElement;
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const send = () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const reply = () => {
  const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const fillPerson = () => {
  type(field("name"), "Test Person");
  type(field("email"), "person@example.invalid");
  act(() => void field("consent").click());
};
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  return call.answers[0] as Record<string, any>;
};
const optionsOf = () => [...field("contactWindow").options].map((o) => [o.value, o.textContent]);

describe("the contact window select", () => {
  it("offers the four default windows with the hours, anytime first and selected, in English", async () => {
    await mount(house("en"));
    expect(field("contactWindow").tagName).toBe("SELECT");
    expect(field("contactWindow").value).toBe("anytime");
    expect(optionsOf()).toEqual([
      ["anytime", "Any time"],
      ["morning", "Morning (09:00–12:00)"],
      ["afternoon", "Afternoon (12:00–17:00)"],
      ["evening", "Evening (17:00–20:00)"],
    ]);
    expect(form().querySelector(`label[for="${field("contactWindow").id}"]`)!.textContent).toBe(ui("contact.contactWindow", "en"));
    expect(ui("contact.contactWindow", "en")).toBe("When can we reach you?");
  });

  it("and in German", async () => {
    await mount(house("de"));
    expect(optionsOf()).toEqual([
      ["anytime", "Jederzeit"],
      ["morning", "Vormittags (09:00–12:00)"],
      ["afternoon", "Nachmittags (12:00–17:00)"],
      ["evening", "Abends (17:00–20:00)"],
    ]);
    expect(ui("contact.contactWindow", "de")).toBe("Wann sind Sie erreichbar?");
  });

  it("has its own full-width row and replaces the free-text field entirely", async () => {
    await mount(house("en"));
    expect(field("contactWindow").closest(".contact__field")!.className).toContain("contact__field--wide");
    expect(form().querySelector("[name=bestTime]")).toBeNull();
  });

  it("shows the seller's zone as one line under it, in the page language; a generic line for other zones; none without a zone", async () => {
    await mount(house("en"));
    expect(form().querySelector(".contact__hint")!.textContent).toBe("Times are in Vienna time.");
    expect(field("contactWindow").getAttribute("aria-describedby")).toBe(form().querySelector(".contact__hint")!.id);
    act(() => root!.unmount());
    box!.remove();
    await mount(house("de"));
    expect(form().querySelector(".contact__hint")!.textContent).toBe("Alle Zeiten in Wiener Zeit.");
    act(() => root!.unmount());
    box!.remove();
    const tokyo = car("en");
    await mount({ ...tokyo, seller: { ...tokyo.seller, timezone: "Asia/Tokyo" } } as Site);
    expect(form().querySelector(".contact__hint")!.textContent).toBe("Times are in the seller's local time.");
    act(() => root!.unmount());
    box!.remove();
    await mount(car("en"));
    expect(form().querySelector(".contact__hint")).toBeNull();
    expect(field("contactWindow").getAttribute("aria-describedby")).toBeNull();
  });

  it("is hidden when the preferred channel is e-mail and shown again for any other channel", async () => {
    await mount(house("en"));
    expect(field("contactWindow")).not.toBeNull();
    type(field("channel"), "email");
    expect(form().querySelector("[name=contactWindow]")).toBeNull();
    expect(form().querySelector(".contact__hint")).toBeNull();
    type(field("channel"), "phone");
    expect(field("contactWindow")).not.toBeNull();
    type(field("channel"), "");
    expect(field("contactWindow")).not.toBeNull(); // no preference: shown
  });

  it("sends the chosen code, and sends anytime when the select is hidden for e-mail (even after a window was chosen)", async () => {
    const f = reply();
    await mount(house("en"));
    act(() => section().open());
    fillPerson();
    type(field("channel"), "phone");
    type(field("contactWindow"), "morning");
    await send();
    expect(JSON.parse((f.mock.calls as any)[0][1].body)).toMatchObject({ channel: "phone", contactWindow: "morning" });
    expect(JSON.parse((f.mock.calls as any)[0][1].body)).not.toHaveProperty("bestTime");
  });

  it("e-mail channel: anytime is sent although a window was chosen before", async () => {
    const f = reply();
    await mount(house("en"));
    act(() => section().open());
    fillPerson();
    type(field("contactWindow"), "evening");
    type(field("channel"), "email");
    await send();
    expect(JSON.parse((f.mock.calls as any)[0][1].body)).toMatchObject({ channel: "email", contactWindow: "anytime" });
  });

  it("the snapshot and the page_context answer carry the CODE only, and only in the phase complete", async () => {
    await mount(house("en"));
    act(() => section().open());
    type(field("channel"), "phone");
    type(field("contactWindow"), "afternoon");
    expect(getFormSnapshot().contactWindow).toBe("afternoon");
    let a = ask();
    expect(a.phase).toBe("open_filling");
    expect(a).not.toHaveProperty("form");
    expect(JSON.stringify(a)).not.toMatch(/afternoon|Nachmittag|12:00/);
    fillPerson();
    a = ask();
    expect(a.phase).toBe("complete");
    expect(a.form.contactWindow).toBe("afternoon");
    expect(a.form).not.toHaveProperty("bestTime");
    expect(JSON.stringify(a)).not.toContain("12:00–17:00"); // the label is never in the answer
    type(field("channel"), "email");
    expect(ask().form.contactWindow).toBe("anytime");
  });

  it("choosing a window alone is a value (the phase leaves closed_empty); the default is not", async () => {
    await mount(house("en"));
    act(() => section().open());
    act(() => section().close());
    expect(ask().phase).toBe("closed_empty");
    act(() => section().open());
    type(field("contactWindow"), "evening");
    act(() => section().close());
    expect(ask().phase).not.toBe("closed_empty");
  });
});

describe("privacy and leftovers", () => {
  it("choosing and sending a window writes nothing to the console, localStorage, sessionStorage or cookies", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    reply();
    await mount(house("en"));
    act(() => section().open());
    fillPerson();
    type(field("channel"), "phone");
    type(field("contactWindow"), "morning");
    ask();
    await send();
    ask();
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("has the strings of the window and its hint in every registry language", () => {
    for (const lang of ["de", "en"] as const) expect(ui("contact.contactWindow", lang)).toBeTruthy();
    expect(ui("contact.contactWindow", "de")).not.toBe(ui("contact.contactWindow", "en"));
  });
});
