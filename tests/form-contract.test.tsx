// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { resetFormSnapshotForTests } from "@/lib/form-snapshot";
import { buildSite } from "@/lib/site";
import { EXAMPLES_DIR, FIXTURE_DIR, examples, fixtures } from "./helpers";
import { fakeWidget } from "./fake-widget";

// The reference site's page-context and agent-after-send scenarios (multivan-landing tests/page-context.test.js, tests/agent-after-send.test.js), run through this page's
// real agent bridge: web and agent mode x the four request types: empty, partial, no_consent, complete, sending, sent, error, and navigation after a send.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const AGENT = { id: "test-agent-id", variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" };
let root: Root | undefined;
let box: HTMLDivElement | undefined;
type Which = "full" | "car" | "house";
/** "full": the fixture car with the example house's viewing settings, so that all four types are offered (Tue, Thu, Sat, 10:00 to 16:00, Vienna; the car costs 589: offers 295 to 1,767). */
async function mount(which: Which = "full", lang: "en" | "de" = "en") {
  const car = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  const house = buildSite(null, examples.ref("example-house"), EXAMPLES_DIR, lang);
  const site = which === "house" ? house : which === "car" ? car : { ...car, viewing: house.viewing };
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={{ ...site, seller: { ...site.seller, agent: AGENT } as any }} />));
}
beforeEach(() => {
  resetFormSnapshotForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T10:00:00Z")); // Wednesday: tomorrow, Thursday the 11th, is a day with visits
  window.location.hash = "";
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

const section = () => box!.querySelector("#contact") as any;
const dialogOpen = () => !!box!.querySelector("dialog[open]");
const field = (name: string) => box!.querySelector(`dialog form [name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const tick = () => act(() => void field("consent").click());
const navigate = (path: string) => {
  const w = fakeWidget();
  let call!: ReturnType<typeof w.command>;
  act(() => void (call = w.command("navigate", { path })));
  w.remove();
  return call;
};
const ask = () => {
  const w = fakeWidget();
  const call = w.command("page_context");
  w.remove();
  expect(call.answeredSynchronously).toBe(true);
  return call.answers[0] as Record<string, any>;
};
const form = () => ask().form as Record<string, any>;
const callStarts = () => document.dispatchEvent(new Event("call-start"));
const callEnds = () => document.dispatchEvent(new Event("call-end"));

/** A fetch the test settles by hand, so that the state "sending" can be read. */
const pending = () => {
  let finish!: (r: Response) => void;
  const f = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
  vi.stubGlobal("fetch", f);
  return { f, ok: (id = "AB12CD34") => finish(new Response(JSON.stringify({ ok: true, id }), { status: 200 })), fail: (status = 503) => finish(new Response(JSON.stringify({ ok: false, error: "unavailable" }), { status })) };
};
const send = () => act(async () => void box!.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const settle = (p: ReturnType<typeof pending>, how: "ok" | "fail") =>
  act(async () => {
    if (how === "ok") p.ok();
    else p.fail();
  });

const TYPES = ["viewing", "testdrive", "question", "offer"] as const;
type T = (typeof TYPES)[number];
const PHONE = "+00 000 000 000";
const MAIL = "person@example.invalid";
const SLOT = { date: "2026-06-11", time: "10:00" };

/** What a form of each type needs, in the reference's words and order, in web mode and in agent mode (the agent arranges times, the question and the amount in the call). */
const EMPTY: Record<"web" | "agent", Record<T, string[]>> = {
  web: { viewing: ["slots", "name", "phone_or_email", "consent"], testdrive: ["slots", "name", "phone_or_email", "consent"], question: ["message", "name", "phone_or_email", "consent"], offer: ["amount", "name", "email", "phone", "consent"] },
  agent: { viewing: ["name", "phone_or_email", "consent"], testdrive: ["name", "phone_or_email", "consent"], question: ["name", "phone_or_email", "consent"], offer: ["name", "email", "phone", "consent"] },
};
/** The first field that is empty and needed, where the focus lands. */
const FIRST: Record<"web" | "agent", Record<T, string>> = {
  web: { viewing: "slot-date", testdrive: "slot-date", question: "name", offer: "amount" },
  agent: { viewing: "name", testdrive: "name", question: "name", offer: "name" },
};

/** Everything but the tick, per type and mode; returns the values the answer must then hold. */
function fillAllButTick(t: T, mode: "web" | "agent"): Record<string, unknown> {
  const base = { name: "Test Person", email: "", phone: "", channel: "", window: "anytime", message: "" } as Record<string, unknown>;
  type(field("name"), "Test Person");
  if (t === "viewing" || t === "testdrive") {
    type(field("email"), MAIL);
    base.email = MAIL;
    if (mode === "web") {
      type(box!.querySelector("dialog .contact__slot input[type=date]") as HTMLInputElement, SLOT.date);
      type(box!.querySelector("dialog .contact__slot select") as HTMLSelectElement, SLOT.time);
      base.slots = [SLOT];
    } else base.slots = [];
  } else if (t === "question") {
    type(field("phone"), PHONE);
    base.phone = PHONE;
    if (mode === "web") {
      type(field("message"), "Is it still available?");
      base.message = "Is it still available?";
    }
  } else {
    type(field("email"), MAIL);
    type(field("phone"), PHONE);
    base.email = MAIL;
    base.phone = PHONE;
    if (mode === "web") type(field("amount"), "800");
    base.amount = mode === "web" ? 800 : null;
  }
  return base;
}

const focusedName = () => {
  const el = document.activeElement as HTMLElement | null;
  if (el?.closest(".contact__slot") && el instanceof HTMLInputElement && el.type === "date") return "slot-date";
  return (el as HTMLInputElement | null)?.name ?? "";
};

for (const mode of ["web", "agent"] as const) {
  describe(`${mode} mode`, () => {
    for (const t of TYPES) {
      describe(`${t}`, () => {
        const go = async () => {
          await mount();
          if (mode === "agent") callStarts();
          const call = navigate(`/#contact-${t}`);
          expect(call.handled).toBe(true);
        };
        afterEach(() => callEnds());

        it("not_opened before the form was opened; then opened by the agent on that type: open_filling, visible, the type's missing fields, focus on the first one needed", async () => {
          await mount();
          expect(form()).toMatchObject({ phase: "not_opened", visible: false, submit: "none", consent: false });
          if (mode === "agent") callStarts();
          expect(navigate(`/#contact-${t}`).handled).toBe(true);
          expect(dialogOpen()).toBe(true);
          expect(form()).toEqual({ phase: "open_filling", type: t, missing: EMPTY[mode][t], consent: false, visible: true, submit: "none" });
          expect(focusedName()).toBe(FIRST[mode][t]);
          expect((field("requestType") as unknown as HTMLSelectElement).value).toBe(t);
          expect(field("name")).toBeTruthy();
          expect(!!box!.querySelector("dialog form[data-agent]")).toBe(mode === "agent");
        });

        it("partial: each field typed leaves the list; closing a partly filled form is incomplete (names only, no values)", async () => {
          await go();
          type(field("name"), "Test Person");
          expect(form().missing).toEqual(EMPTY[mode][t].filter((k) => k !== "name"));
          act(() => section().close());
          expect(form()).toMatchObject({ phase: "incomplete", visible: false });
          expect(form()).not.toHaveProperty("values");
          expect(JSON.stringify(ask())).not.toContain("Test Person");
        });

        it("closed_empty: opened and left with nothing entered", async () => {
          await go();
          act(() => section().close());
          expect(form()).toMatchObject({ phase: "closed_empty", visible: false });
        });

        it("no_consent: everything valid and only the tick missing, whether the dialog is open or closed; no values", async () => {
          await go();
          fillAllButTick(t, mode);
          expect(form()).toEqual({ phase: "no_consent", type: t, missing: ["consent"], consent: false, visible: true, submit: "none" });
          act(() => section().close());
          expect(form()).toEqual({ phase: "no_consent", type: t, missing: ["consent"], consent: false, visible: false, submit: "none" });
        });

        it("complete with the tick: the values, by type, only now; the dialog open or closed", async () => {
          await go();
          const values = fillAllButTick(t, mode);
          tick();
          for (const visible of [true, false]) {
            if (!visible) act(() => section().close());
            expect(form()).toEqual({ phase: "complete", type: t, missing: [], consent: true, visible, submit: "none", values, ...legacy(values, t) });
          }
          expect(JSON.stringify(ask())).not.toMatch(/website|honeypot|elapsed/i);
        });

        it("sending: submit sending while the request is in flight, values still there, no number yet; then sent with the number, complete, values kept", async () => {
          await go();
          const values = fillAllButTick(t, mode);
          tick();
          const request = pending();
          await send();
          expect(request.f).toHaveBeenCalledTimes(1);
          expect(form()).toMatchObject({ phase: "complete", submit: "sending", missing: [], values });
          expect(form()).not.toHaveProperty("requestId");
          expect(JSON.parse((request.f.mock.calls as any)[0][1].body)).toMatchObject({ requestType: t, source: mode === "agent" ? "agent" : "form" });
          await settle(request, "ok");
          expect(form()).toMatchObject({ phase: "complete", submit: "sent", requestId: "AB12CD34", missing: [], consent: true, values });
          expect(box!.querySelector("dialog .contact__success")).not.toBeNull();
          // the legacy top-level keys say the same in their old words
          expect(ask()).toMatchObject({ phase: "complete", submit: "sent", missing: [] });
        });

        it("sent stays: leading to the same type again does not reset it (the number, the values and 'complete' stay); the dialog is closed or open", async () => {
          await go();
          const values = fillAllButTick(t, mode);
          tick();
          const request = pending();
          await send();
          await settle(request, "ok");
          for (const closeFirst of [false, true]) {
            if (closeFirst) act(() => section().close());
            expect(navigate(`/#contact-${t}`).handled).toBe(true);
            expect(form()).toMatchObject({ phase: "complete", submit: "sent", requestId: "AB12CD34", values, visible: true });
          }
          expect(navigate(t === "viewing" ? "/#contact-viewing" : "/#contact-" + t).handled).toBe(true);
          expect(form().requestId).toBe("AB12CD34");
        });

        it("another type after a send starts a new request: nothing of the old one is left, the answer is that of an empty form of the new type", async () => {
          await go();
          fillAllButTick(t, mode);
          tick();
          const request = pending();
          await send();
          await settle(request, "ok");
          const other: T = t === "offer" ? "question" : "offer";
          expect(navigate(`/#contact-${other}`).handled).toBe(true);
          expect(form()).toEqual({ phase: "open_filling", type: other, missing: EMPTY[mode][other], consent: false, visible: true, submit: "none" });
          expect(JSON.stringify(ask())).not.toMatch(/AB12CD34|Test Person|example\.invalid/);
          expect(field("name").value).toBe("");
          expect(box!.querySelector("dialog .contact__success")).toBeNull(); // the form is back
        });

        it("a failed send: submit error, still complete, values kept, no number; the next edit puts it back to none; a retry that works is sent", async () => {
          await go();
          const values = fillAllButTick(t, mode);
          tick();
          vi.spyOn(console, "error").mockImplementation(() => {});
          const bad = pending();
          await send();
          await settle(bad, "fail");
          expect(form()).toMatchObject({ phase: "complete", submit: "error", missing: [], values });
          expect(form()).not.toHaveProperty("requestId");
          type(field("message"), "A change");
          expect(form().submit).toBe("none");
          const good = pending();
          await send();
          expect(form().submit).toBe("sending");
          await settle(good, "ok");
          expect(form()).toMatchObject({ submit: "sent", requestId: "AB12CD34" });
        });
      });
    }
  });
}

/** The deprecated flat values inside `form`, as the first version of the answer had them (a viewing and a test drive carry the slots, an offer the amount). */
function legacy(values: Record<string, any>, t: T) {
  return { requestType: t, name: values.name, email: values.email, phone: values.phone, preferredChannel: values.channel, contactWindow: values.window, message: values.message, preferredSlots: values.slots ?? [], ...(t === "offer" ? { amount: values.amount } : {}) };
}

describe("navigate: the contact targets", () => {
  it("each #contact-<type> opens the dialog on that type, with every spelling of the test drive", async () => {
    await mount();
    for (const [path, expected] of [["/#contact-viewing", "viewing"], ["/#contact-testdrive", "testdrive"], ["/#contact-test_drive", "testdrive"], ["/#contact-question", "question"], ["/#contact-offer", "offer"], ["/en#contact-OFFER", "offer"], ["/#Contact-Question", "question"]] as const) {
      expect(navigate(path).handled, path).toBe(true);
      expect(dialogOpen(), path).toBe(true);
      expect(form().type, path).toBe(expected);
      expect((field("requestType") as unknown as HTMLSelectElement).value, path).toBe(expected);
    }
  });

  it("plain /#contact is a viewing where the product offers one", async () => {
    await mount("full");
    expect(navigate("/#contact").handled).toBe(true);
    expect(form().type).toBe("viewing");
    expect(navigate("/en#contact").handled).toBe(true);
    expect(form().type).toBe("viewing");
  });

  it("... and the first offered type where it does not (a product without viewing settings: a question)", async () => {
    await mount("car");
    expect(navigate("/#contact").handled).toBe(true);
    expect(form().type).toBe("question");
  });

  it("a type the product does not offer falls back to the default type (a question)", async () => {
    await mount("car"); // question and offer only
    for (const slug of ["viewing", "testdrive", "test_drive"]) {
      act(() => section().close());
      expect(navigate(`/#contact-${slug}`).handled, slug).toBe(true);
      expect(form().type, slug).toBe("question");
    }
    act(() => section().close());
    await act(async () => root!.unmount());
    box!.remove();
    await mount("house"); // viewing, question, offer: no test drive
    expect(navigate("/#contact-testdrive").handled).toBe(true);
    expect(form().type).toBe("question");
  });

  it("a name that is no request type is not a target: not handled, nothing opens", async () => {
    await mount();
    for (const path of ["/#contact-booking", "/#contact-", "/#contact-offer-now", "/#contact-1", "/#contacts", "/#contact-offer?x=1"]) {
      expect(navigate(path).handled, path).toBe(false);
      expect(dialogOpen(), path).toBe(false);
    }
  });

  it("with the dialog open, leading to another type switches to it and keeps what was typed; the same type changes nothing", async () => {
    await mount();
    navigate("/#contact-question");
    type(field("name"), "Typed Name");
    act(() => field("name").focus());
    expect(navigate("/#contact-question").handled).toBe(true);
    expect(document.activeElement).toBe(field("name")); // nothing moved
    expect(navigate("/#contact-offer").handled).toBe(true);
    expect(form().type).toBe("offer");
    expect(field("name").value).toBe("Typed Name");
    expect(focusedName()).toBe("amount"); // the first field this type still needs
  });

  it("the agent's request is marked only while a call runs; without one it is the visitor's form", async () => {
    await mount();
    navigate("/#contact-question");
    expect(box!.querySelector("dialog form[data-agent]")).toBeNull();
    act(() => section().close());
    callStarts();
    navigate("/#contact-question");
    expect(box!.querySelector("dialog form[data-agent]")).not.toBeNull();
    callEnds();
  });
});

describe("the address bar", () => {
  const hash = (value: string) => {
    window.location.hash = value;
    act(() => void window.dispatchEvent(new HashChangeEvent("hashchange")));
  };

  it("the same hashes open the dialog on that type, when the page has loaded and when the hash changes", async () => {
    window.location.hash = "#contact-offer";
    await mount();
    expect(dialogOpen()).toBe(true);
    expect(form()).toMatchObject({ type: "offer", visible: true, phase: "open_filling" });
    act(() => section().close());
    hash("#contact-viewing");
    expect(dialogOpen()).toBe(true);
    expect(form().type).toBe("viewing");
    expect(box!.querySelector("dialog form[data-agent]")).toBeNull(); // the visitor's own: a web form
  });

  it("a plain #contact in the address bar still only scrolls to the footer row (the header button's way); other hashes do nothing", async () => {
    await mount();
    for (const value of ["#contact", "#contact-nonsense", "#offer", ""]) {
      hash(value);
      expect(dialogOpen(), value).toBe(false);
    }
  });

  it("a type the product does not offer opens the default type; the hash of a visitor after a send starts a new request", async () => {
    await mount("car");
    hash("#contact-testdrive");
    expect(form().type).toBe("question");
    type(field("name"), "Test Person");
    type(field("phone"), PHONE);
    type(field("message"), "A question");
    tick();
    const request = pending();
    await send();
    await settle(request, "ok");
    expect(form().submit).toBe("sent");
    act(() => section().close());
    hash("#contact-offer");
    expect(form()).toMatchObject({ type: "offer", submit: "none", phase: "open_filling" });
    expect(form()).not.toHaveProperty("requestId");
  });
});

describe("the answer's top level", () => {
  it("has the language, the path, the title, the section and the view next to the form", async () => {
    await mount("full", "de");
    const a = ask();
    expect(Object.keys(a).sort()).toEqual(["dialogOpen", "form", "language", "missing", "path", "phase", "product", "section", "submit", "title", "view"]);
    expect(a.language).toBe("de");
    expect(a).toHaveProperty("section");
    expect(a.section).toBe(a.view.section);
    expect(a.view).toHaveProperty("photo");
  });

  it("the deprecated keys still say what they said: dialogOpen, phase (no_consent only while closed), submit (failed) and the schema's field names in missing", async () => {
    await mount();
    navigate("/#contact-viewing");
    expect(ask()).toMatchObject({ dialogOpen: true, phase: "open_filling", submit: "none", missing: ["preferredSlots", "name", "email", "phone", "consent"] });
    fillAllButTick("viewing", "web");
    expect(ask()).toMatchObject({ phase: "open_filling", missing: ["consent"] }); // the old phase: open, so open_filling
    expect(form().phase).toBe("no_consent"); // the new one: everything valid but the tick
    act(() => section().close());
    expect(ask()).toMatchObject({ phase: "no_consent" });
  });
});
