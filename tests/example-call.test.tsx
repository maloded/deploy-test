// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import { FIRST_WORD, NEXT_LINE, RESTART_AFTER, RESTART_DELAY, WORD_DELAY, createExampleCall } from "@/components/example-call";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import type { WidgetHost } from "@/lib/hanc-bridge";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const EXAMPLE = {
  en: [
    { speaker: "caller" as const, text: "Is it still available?" },
    { speaker: "agent" as const, text: "Yes, it is, and I can book a viewing." },
    { speaker: "caller" as const, text: "Good." },
  ],
  de: [{ speaker: "caller" as const, text: "Ist das noch frei?" }, { speaker: "agent" as const, text: "Ja." }],
};
const PACK: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en", "de"], example: EXAMPLE, liveText: null };

let io: { cb: IntersectionObserverCallback; el: Element }[] = [];
let reduced = false;
const setView = (ratio: number) => act(() => io.forEach(({ cb, el }) => cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio, target: el } as any], {} as any)));

describe("the example call on the card", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    io = [];
    reduced = false;
    (window as any).IntersectionObserver = class {
      constructor(public cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        io.push({ cb: this.cb, el });
      }
      disconnect() {
        io = io.filter((i) => i.cb !== this.cb);
      }
      unobserve() {}
    };
    (window as any).requestIdleCallback = () => 1;
    (window as any).cancelIdleCallback = () => {};
    (window as any).matchMedia = (q: string) => ({ get matches() { return q.includes("reduce") ? reduced : false; }, addEventListener() {}, removeEventListener() {} });
    if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    vi.useRealTimers();
  });

  const fakeHost = () => {
    const host = document.createElement("hanc-ai-pill-floating-call") as any;
    host.callStatus = "idle";
    document.body.appendChild(host);
    return host as WidgetHost & { callStatus: string };
  };
  const mount = async (props: { placement?: "hero" | "dock"; lang?: "en" | "de"; avatar?: ResolvedAvatar; host?: WidgetHost | null } = {}) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={props.avatar ?? PACK} lang={props.lang ?? "en"} host={props.host ?? null} placement={props.placement ?? "hero"}>x</AgentAvatarCard>));
    return document.querySelector<HTMLElement>(".avatar-card")!;
  };
  const lines = () => Array.from(document.querySelectorAll<HTMLElement>(".avatar-card__line"));
  const on = () => lines().filter((l) => "on" in l.dataset).map((l) => lines().indexOf(l));
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("renders the transcript on the large card, in the page language, with the agent's name and the localized caller label", async () => {
    await mount({ lang: "de" });
    const rows = lines();
    expect(rows).toHaveLength(2);
    expect(rows.map((l) => l.querySelector(".avatar-card__who")!.textContent)).toEqual(["Anrufer", "Test pack"]);
    expect(rows[0].querySelector(".avatar-card__text")!.textContent).toBe("Ist das noch frei?");
    expect(document.querySelector(".avatar-card__cap-head")!.textContent).toBe("Beispielgespräch");
    expect(document.querySelector(".avatar-card__captions")!.closest(".avatar-card__frame")).not.toBeNull();
  });

  it("is not on the docked card and not in the circle: no block, no timers", async () => {
    await mount({ placement: "dock" });
    expect(document.querySelector(".avatar-card__captions")).toBeNull();
    expect(document.querySelector("[data-live]")).toBeNull();
    expect(document.querySelector(".avatar-card__lines")).toBeNull();
  });

  it("has no transcript block without an example", async () => {
    await mount({ avatar: { ...PACK, example: null } });
    expect(document.querySelector(".avatar-card__captions")).toBeNull();
  });

  it("falls back to nothing for a language without a call", async () => {
    await mount({ avatar: { ...PACK, example: { en: EXAMPLE.en } }, lang: "de" });
    expect(document.querySelector(".avatar-card__captions")).toBeNull();
  });

  it("splits a text at ordinary spaces only (a no-break space keeps its words together)", async () => {
    await mount({ avatar: { ...PACK, example: { en: [{ speaker: "agent", text: "Open 10 h daily" }] } } });
    const words = Array.from(document.querySelectorAll("[data-w]")).map((w) => w.textContent);
    expect(words).toEqual(["Open", "10 h", "daily"]);
  });

  it("does not run while the card is off screen, runs at 30% in view with Hanc's timings, and stops again when it leaves", async () => {
    const card = await mount();
    const caps = document.querySelector<HTMLElement>(".avatar-card__captions")!;
    await advance(5000);
    expect(caps.hasAttribute("data-live")).toBe(false); // never started: the first two lines are shown still
    setView(0.2);
    await advance(100);
    expect(caps.hasAttribute("data-live")).toBe(false); // under 30%
    setView(0.5);
    expect(caps.hasAttribute("data-live")).toBe(true);
    expect(on()).toEqual([0]); // line 0 appears at once
    const said = () => Array.from(lines()[0].querySelectorAll("[data-w]")).filter((w) => "said" in (w as HTMLElement).dataset).length;
    expect(said()).toBe(0);
    await advance(FIRST_WORD);
    expect(said()).toBe(1);
    // "Is it still available?" is 4 words: the last comes at 140 + 3 x 170 ms
    await advance(WORD_DELAY * 3);
    expect(said()).toBe(4);
    expect(card.hasAttribute("data-talking")).toBe(false); // the caller speaks first
    // the next line follows 1100 ms after the last word
    await advance(WORD_DELAY + NEXT_LINE);
    expect(on()).toEqual([0, 1]);
    expect(lines()[0].hasAttribute("data-past")).toBe(true);
    expect(card.hasAttribute("data-talking")).toBe(true); // the agent's words: the bars move
    setView(0);
    expect(card.hasAttribute("data-talking")).toBe(false);
    const frozen = on();
    await advance(10_000);
    expect(on()).toEqual(frozen); // nothing moves while it is away
  });

  it("restarts after the last line: 3200 ms after its words, the lines leave and line 0 comes back 500 ms later", async () => {
    await mount({ avatar: { ...PACK, example: { en: [{ speaker: "caller", text: "Hello" }, { speaker: "agent", text: "Hi" }] } } });
    setView(1);
    const lastDone = FIRST_WORD + 1 * WORD_DELAY; // one word
    await advance(lastDone + NEXT_LINE + lastDone); // line 1 has said its word
    expect(on()).toEqual([0, 1]);
    await advance(RESTART_AFTER - 1);
    expect(on()).toEqual([0, 1]);
    await advance(1);
    expect(on()).toEqual([]);
    await advance(RESTART_DELAY);
    expect(on()).toEqual([0]);
  });

  it("is hidden while a call is connecting or live and after a failure; the status line stands in its place", async () => {
    const host = fakeHost();
    await mount({ host });
    setView(1);
    expect(lines().length).toBeGreaterThan(0);
    host.callStatus = "connecting";
    await advance(200);
    expect(lines()).toHaveLength(0);
    expect(document.querySelector(".avatar-card__cap-head")!.textContent).toBe("Calling");
    expect(document.querySelector(".avatar-card__status")!.textContent).toBe("Connecting you to Test pack. Allow the microphone when your browser asks.");
    host.callStatus = "connected";
    await advance(1000);
    expect(lines()).toHaveLength(0);
    expect(document.querySelector(".avatar-card")!.getAttribute("data-call")).toBe("connected");
    expect(document.querySelector(".avatar-card__cap-head")!.textContent).toContain("Live call");
    expect(document.querySelector(".avatar-card__status")!.textContent).toBe("You are live with Test pack.");
    expect(document.querySelector(".avatar-card__live")).not.toBeNull();
    await advance(3000); // the call counted from the moment it was seen live (the status is read every 150 ms)
    expect(document.querySelector(".avatar-card__timer")!.textContent).toBe("00:03");
    host.callStatus = "idle"; // an ordinary end: the example comes back
    await advance(300);
    expect(lines().length).toBeGreaterThan(0);
    expect(document.querySelector(".avatar-card__status")).toBeNull();
    expect(document.querySelector(".avatar-card__live")).toBeNull();
  });

  it("the live sentence does not ask the caller to speak; the header (bars, \"Live call\", timer) stays; the connecting sentence is unchanged", async () => {
    for (const [lang, head, live, connecting] of [
      ["en", "Live call", "You are live with Test pack.", "Connecting you to Test pack. Allow the microphone when your browser asks."],
      ["de", "Live-Gespräch", "Sie sind live mit Test pack verbunden.", "Sie werden mit Test pack verbunden. Erlauben Sie das Mikrofon, wenn Ihr Browser fragt."],
    ] as const) {
      const host = fakeHost();
      await mount({ host, lang });
      host.callStatus = "connecting";
      await advance(200);
      expect(document.querySelector(".avatar-card__status")!.textContent).toBe(connecting);
      host.callStatus = "connected";
      await advance(200);
      expect(document.querySelector(".avatar-card__cap-head")!.textContent).toContain(head);
      expect(document.querySelector(".avatar-card__timer")).not.toBeNull();
      expect(document.querySelector(".avatar-card__status")!.textContent).toBe(live);
      expect(document.querySelector(".avatar-card__status")!.textContent).not.toMatch(/hello|hallo/i);
      act(() => root!.unmount());
      root = undefined;
      document.body.innerHTML = "";
    }
  });

  it("the seller's liveText replaces the sentence, with the agent's name put in", async () => {
    const host = fakeHost();
    await mount({ host, lang: "de", avatar: { ...PACK, liveText: { en: "{name} is on the line.", de: "{name} ist in der Leitung." } } });
    host.callStatus = "connecting";
    await advance(200);
    host.callStatus = "connected";
    await advance(200);
    expect(document.querySelector(".avatar-card__status")!.textContent).toBe("Test pack ist in der Leitung.");
  });

  it("a call that never connects says so, with the start label, until the next attempt", async () => {
    const host = fakeHost();
    await mount({ host, avatar: { ...PACK, startLabel: { en: "Call Sofia", de: "Sofia anrufen" } } });
    host.callStatus = "connecting";
    await advance(200);
    host.callStatus = "idle";
    await advance(300);
    expect(lines()).toHaveLength(0);
    expect(document.querySelector(".avatar-card__cap-head")!.textContent).toBe("Call not started");
    expect(document.querySelector(".avatar-card__status")!.textContent).toBe('The call did not connect. Check your microphone and connection, then press "Call Sofia".');
    expect(document.querySelector(".avatar-card")!.getAttribute("data-call")).toBe("error");
    await advance(5000);
    expect(document.querySelector(".avatar-card__status")).not.toBeNull(); // it stays
  });

  it("with the default start label the status quotes \"Talk to {name} now\"", async () => {
    const host = fakeHost();
    await mount({ host });
    host.callStatus = "connecting";
    await advance(200);
    host.callStatus = "connected";
    await advance(200);
    host.callStatus = "error";
    await advance(300);
    expect(document.querySelector(".avatar-card__cap-head")!.textContent).toBe("Call dropped");
    expect(document.querySelector(".avatar-card__status")!.textContent).toBe('The call dropped. Press "Talk to Test pack now" to call again.');
  });

  it("with reduced motion the first two lines are shown whole and still: nothing moves", async () => {
    reduced = true;
    await mount();
    setView(1);
    const caps = document.querySelector<HTMLElement>(".avatar-card__captions")!;
    expect(caps.hasAttribute("data-live")).toBe(false);
    expect(on()).toEqual([0, 1]);
    expect(Array.from(document.querySelectorAll("[data-w]")).slice(0, 4).every((w) => "said" in (w as HTMLElement).dataset)).toBe(true);
    await advance(30_000);
    expect(on()).toEqual([0, 1]); // nothing moves
    expect(caps.hasAttribute("data-live")).toBe(false);
  });

  it("renders nothing of it on the server except the still lines (no script runs)", () => {
    const html = renderToStaticMarkup(<AgentAvatarCard avatar={PACK} lang="en" placement="hero">x</AgentAvatarCard>);
    expect(html).toContain("avatar-card__captions");
    expect(html).not.toContain("data-live");
  });
});

describe("the orb's rings on the card (data-rings)", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    io = [];
    (window as any).IntersectionObserver = class {
      constructor(public cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        io.push({ cb: this.cb, el });
      }
      disconnect() {
        io = io.filter((i) => i.cb !== this.cb);
      }
      unobserve() {}
    };
    (window as any).requestIdleCallback = () => 1;
    (window as any).cancelIdleCallback = () => {};
    (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    vi.useRealTimers();
  });
  const mount = async (host: WidgetHost | null = null) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={PACK} lang="en" host={host} placement="hero">x</AgentAvatarCard>));
    return document.querySelector<HTMLElement>(".avatar-card")!;
  };
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("rests, plays the authored moment once 2.4 s after load, then settles to one soft wave every 7 s", async () => {
    const card = await mount();
    setView(1);
    expect(card.dataset.rings).toBe("off");
    await advance(2400);
    expect(card.dataset.rings).toBe("burst");
    await advance(2800);
    expect(card.dataset.rings).toBe("idle");
  });

  it("skips the moment when the card is off screen, and rests (away) while it stays off screen", async () => {
    const card = await mount();
    setView(0);
    await advance(2400);
    expect(card.dataset.rings).toBe("away"); // the moment is skipped for good
    setView(1);
    expect(card.dataset.rings).toBe("idle");
    await advance(5000);
    expect(card.dataset.rings).toBe("idle"); // it does not come back as a burst
  });

  it("is busy while the call connects, off during it and for good after a first touch of the button", async () => {
    const host = document.createElement("hanc-ai-pill-floating-call") as any;
    host.callStatus = "idle";
    document.body.appendChild(host);
    const card = await mount(host);
    setView(1);
    await advance(2400);
    await advance(2900);
    expect(card.dataset.rings).toBe("idle");
    host.callStatus = "connecting";
    await advance(200);
    expect(card.dataset.rings).toBe("busy");
    host.callStatus = "connected";
    await advance(200);
    expect(card.dataset.rings).toBe("off");
    host.callStatus = "idle";
    await advance(300);
    expect(card.dataset.rings).toBe("off"); // a call attempt ended the invitation
  });

  it("a press on the button's area ends the invitation before the moment", async () => {
    const card = await mount();
    setView(1);
    act(() => void card.querySelector(".avatar-card__action")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await advance(2400);
    expect(card.dataset.rings).toBe("off");
    await advance(3000);
    expect(card.dataset.rings).toBe("off");
  });
});

describe("createExampleCall", () => {
  it("does not throw without the Web Animations API", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p data-cap-head></p><ol><li data-line data-who="agent"><span data-w>Hi</span></li></ol>';
    const engine = createExampleCall(root, document.createElement("div"));
    expect(() => engine.update(true)).not.toThrow();
    engine.stop();
  });
});
