// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
/**
 * The scenarios of the form and agent states, one test each, with the fake widget. The lead API behind the fetch of the
 * autofill scenario is the real handler (the too-fast rule is not imitated).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { handleLead } from "@/lib/lead-handler";
import { leadLimiter } from "@/lib/rate-limit";
import { MIN_FILL_MS } from "@/lib/lead";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { EXAMPLES_DIR, FIXTURE_DIR, examples, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
const HOUSE = examples.ref("example-house");
const NAME = "Zed Quillfeather";
const EMAIL = "zed.quillfeather@example.invalid";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "form-states-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
let root: Root | undefined;
let box: HTMLDivElement | undefined;
async function mount(lang: "de" | "en" = "en", withGallery = false) {
  const site = withGallery ? buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang) : buildSite(null, HOUSE, examples.root, lang);
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: AGENT } as any }} />));
}
// Wednesday 10 June 2026, 12:00 in Vienna. Only Date is faked.
beforeEach(() => {
  resetFormSnapshotForTests();
  leadLimiter.reset();
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
const field = (name: string) => box!.querySelector(`dialog.contact-dialog form [name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const check = (el: HTMLInputElement) => act(() => void el.click());
const send = () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  return call.answers[0] as Record<string, any>;
};
const navigateContact = () => {
  const w = fakeWidget();
  let call!: ReturnType<typeof w.command>;
  act(() => void (call = w.command("navigate", { path: "/#contact" })));
  w.remove();
  return call;
};
const reply = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: status === 200 }), { status, headers: { "content-type": "application/json" } })));
const fillAll = () => {
  act(() => section().open());
  type(field("name"), NAME);
  type(field("email"), EMAIL);
  check(field("consent"));
};

describe("the scenarios", () => {
  it("1. complete without send: complete, submit none, the values in form", async () => {
    await mount();
    fillAll();
    const a = ask();
    expect(a).toMatchObject({ phase: "complete", submit: "none", missing: [] });
    expect(a.form).toMatchObject({ name: NAME, email: EMAIL });
  });

  it("2. sent: submit sent, the phase stays complete, the values stay", async () => {
    await mount();
    reply(200);
    fillAll();
    await send();
    const a = ask();
    expect(a).toMatchObject({ phase: "complete", submit: "sent", missing: [] });
    expect(a.form).toMatchObject({ name: NAME, email: EMAIL });
  });

  it("3. failed 503: the values stay, submit failed, the could-not-be-sent message with the mailto link", async () => {
    await mount();
    reply(503);
    fillAll();
    await send();
    const a = ask();
    expect(a).toMatchObject({ phase: "complete", submit: "failed" });
    expect(a.form).toMatchObject({ name: NAME, email: EMAIL });
    expect(field("name").value).toBe(NAME);
    expect(form().querySelector(".contact__summary a")!.getAttribute("href")).toMatch(/^mailto:/);
  });

  it("4. an empty required field: open_filling and the name of the field in missing", async () => {
    await mount();
    act(() => section().open());
    type(field("email"), EMAIL);
    check(field("consent"));
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["name"] });
  });

  it("5. consent unticked, dialog closed: no_consent with missing [consent]", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    type(field("email"), EMAIL);
    act(() => section().close());
    expect(ask()).toMatchObject({ phase: "no_consent", missing: ["consent"] });
  });

  it("6. consent unticked, dialog open: open_filling with missing [consent]", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    type(field("email"), EMAIL);
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["consent"] });
  });

  it("7. closed halfway (consent given, a required field missing): incomplete, no values", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    check(field("consent"));
    act(() => section().close());
    const a = ask();
    expect(a).toMatchObject({ phase: "incomplete", missing: ["email"] });
    expect(JSON.stringify(a)).not.toContain(NAME);
    expect(a).not.toHaveProperty("form");
  });

  it("8. an edit after the agent read the form: the next page_context has the new values", async () => {
    await mount();
    fillAll();
    expect(ask().form.name).toBe(NAME);
    type(field("name"), "Changed Name");
    expect(ask().form.name).toBe("Changed Name");
  });

  it("9. the dialog is already open: navigate #contact is handled and changes nothing", async () => {
    await mount();
    act(() => section().open());
    type(field("name"), NAME);
    act(() => field("email").focus());
    expect(navigateContact().handled).toBe(true);
    expect(document.activeElement).toBe(field("email"));
    expect(field("name").value).toBe(NAME);
  });

  it("10. the lightbox is open: it is closed first, then the dialog opens with focus on the first empty required field", async () => {
    await mount("en", true); // the fixture car has a gallery; the house example has none
    act(() => (box!.querySelector("#gallery") as any).openLightbox(0));
    expect(box!.querySelector("dialog.lightbox[open]")).not.toBeNull();
    expect(navigateContact().handled).toBe(true);
    expect(box!.querySelector("dialog.lightbox")).toBeNull();
    expect(document.activeElement).toBe(field("name"));
  });

  it("11. browser autofill followed by Send within the too-fast limit: the real handler refuses (422), the form says check-and-send-again, submit is failed with the values kept; a second Send after the limit goes through", async () => {
    await mount();
    const env = { CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE, LEADS_STORE: "file", LEADS_DIR: path.join(tmp, "leads") };
    const calls: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body.elapsedMs);
        return handleLead(new Request("http://localhost:3000/api/lead", { method: "POST", headers: { ...(init.headers as Record<string, string>), host: "localhost:3000", "x-forwarded-for": "198.51.100.7" }, body: init.body as string }), env);
      }),
    );
    act(() => section().open());
    // autofill: the browser fills the fields at once (input events, no typing); the visitor ticks consent and presses Send
    type(field("name"), NAME);
    type(field("email"), EMAIL);
    check(field("consent"));
    await send();
    expect(calls[0]).toBeLessThan(MIN_FILL_MS);
    expect(form().querySelector(".contact__summary")!.textContent).toBe(ui("contact.error.tooFast", "en"));
    expect(form().querySelector(".contact__summary a")).toBeNull();
    expect(ask()).toMatchObject({ phase: "complete", submit: "failed" });
    expect(field("name").value).toBe(NAME);
    expect(fs.existsSync(env.LEADS_DIR) ? fs.readdirSync(env.LEADS_DIR) : []).toEqual([]);
    // recoverable: no automatic retry, the visitor sends again once the limit has passed
    vi.setSystemTime(new Date(Date.now() + MIN_FILL_MS + 500));
    await send();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThanOrEqual(MIN_FILL_MS);
    await act(async () => void (await vi.waitFor(() => expect(ask().submit).toBe("sent")))); // the real handler writes a file
    expect(ask()).toMatchObject({ phase: "complete", submit: "sent" });
    expect(fs.readdirSync(env.LEADS_DIR)).toHaveLength(1);
  });

  it("12. no values outside complete, no console output and no storage writes in any phase", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const setLocal = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    const answers: Record<string, any>[] = [];
    await mount();
    answers.push(ask()); // not_opened
    act(() => section().open());
    answers.push(ask()); // open_filling
    act(() => section().close());
    answers.push(ask()); // closed_empty
    act(() => section().open());
    type(field("name"), NAME);
    type(field("email"), EMAIL);
    act(() => section().close());
    answers.push(ask()); // no_consent
    act(() => section().open());
    check(field("consent"));
    type(field("email"), "broken");
    act(() => section().close());
    answers.push(ask()); // incomplete
    act(() => section().open());
    type(field("email"), EMAIL);
    answers.push(ask()); // complete
    reply(503);
    await send();
    answers.push(ask()); // complete, failed
    expect(answers.map((a) => a.phase)).toEqual(["not_opened", "open_filling", "closed_empty", "no_consent", "incomplete", "complete", "complete"]);
    for (const a of answers) {
      if (a.phase !== "complete") {
        expect(a).not.toHaveProperty("form");
        expect(JSON.stringify(a)).not.toMatch(/Quillfeather|example\.invalid|broken/);
      }
    }
    expect(setLocal).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
