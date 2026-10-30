// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { CARD_FLIGHT, cubicBezier, mixRect } from "@/lib/card-flight";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const loop = (n: string) => ({ mp4: `/avatars/p/${n}.mp4` });
const PACK: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: loop("i"), listen: loop("l"), speak: loop("s"), caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en"], example: null, liveText: null };

const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

describe("the flight's maths", () => {
  it("is Hanc's ease: 0 at 0, 1 at 1, fast at the start and settling", () => {
    const ease = cubicBezier(...CARD_FLIGHT.ease);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.25)).toBeGreaterThan(0.6);
    expect(ease(0.5)).toBeGreaterThan(0.9);
    expect(ease(0.9)).toBeLessThan(1);
  });
  it("mixes two boxes linearly", () => {
    expect(mixRect({ left: 0, top: 0, width: 100, height: 200 }, { left: 100, top: 50, width: 50, height: 100 }, 0.5)).toEqual({ left: 50, top: 25, width: 75, height: 150 });
  });
  it("has the approved constants", () => {
    expect(CARD_FLIGHT).toMatchObject({ trigger: 0.28, ms: 640, ease: [0.23, 1, 0.32, 1], crossfadeMs: 260, entryAbove: 1.1 });
  });
});

describe("the ghost's CSS", () => {
  it("hides only the card's looks during the flight, by visibility: never the widget, its host, the action area or the card itself", () => {
    const flight = rules.filter((r) => r.selector.includes("[data-flight]"));
    expect(flight.length).toBeGreaterThan(0);
    for (const r of flight) {
      expect(r.body.trim().replace(/\s+/g, " ")).toBe("visibility: hidden;");
      for (const sel of r.selector.split(",").map((s) => s.trim())) {
        expect(sel, sel).toMatch(/^\.avatar-card\[data-flight\] \.(avatar-card__frame|call-bubble|call-orb|avatar-card__start)$/);
      }
    }
    expect(css).not.toMatch(/data-flight[^{]*(hanc-ai|avatar-card__action)/);
  });
  it("puts no transform, filter, contain or the like on the ghost's rules that could reach the widget: the ghost is not an ancestor of it (the guard test reads the card's rules)", () => {
    for (const r of rules.filter((r) => /\.card-ghost/.test(r.selector))) expect(r.body).not.toMatch(/(^|;|\s)(transform|translate|scale|rotate|perspective|filter|backdrop-filter|will-change|contain|container-type)\s*:/);
  });
  it("shows no ghost under reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.card-ghost \{\s*display: none;/);
  });
});

describe("the flight of the ghost in the page", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let ios: { cb: any; targets: Element[]; options?: any }[] = [];
  let frames: FrameRequestCallback[] = [];
  let clock = 0;
  let reduced = false;
  let slot = { left: 600, top: 120, width: 400, height: 500 };
  const DOCK = { left: 1000, top: 560, width: 200, height: 250 };
  let zone = { left: 1000, top: 560, width: 200, height: 250 };
  const box4 = (r: { left: number; top: number; width: number; height: number }) => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} }) as DOMRect;

  beforeEach(() => {
    ios = [];
    frames = [];
    clock = 1000;
    reduced = false;
    slot = { left: 600, top: 120, width: 400, height: 500 };
    zone = { ...DOCK };
    (window as any).IntersectionObserver = class {
      o: { cb: any; targets: Element[]; options?: any };
      constructor(cb: any, options?: any) {
        this.o = { cb, targets: [], options };
        ios.push(this.o);
      }
      observe(el: Element) {
        this.o.targets.push(el);
      }
      disconnect() {
        ios = ios.filter((i) => i !== this.o);
      }
      unobserve() {}
    };
    (window as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    (window as any).requestIdleCallback = (cb: () => void) => (cb(), 1);
    (window as any).cancelIdleCallback = () => {};
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => (frames.push(cb), frames.length);
    (window as any).cancelAnimationFrame = () => void (frames = []);
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("reduce") && reduced, addEventListener() {}, removeEventListener() {} });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 0 });
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
    if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    document.body.innerHTML = "";
    root = box = undefined;
    vi.restoreAllMocks();
  });

  const page = async (props: { callStatus?: string; content?: boolean } = {}) => {
    document.body.innerHTML = `<main><section id="hero"><div data-agent-slot="true"></div>${props.content ? '<p class="hero__description"></p><ul class="hero__facts"></ul>' : ""}</section></main><div id="card-box"></div>`;
    const slotEl = document.querySelector<HTMLElement>("[data-agent-slot]")!;
    slotEl.getBoundingClientRect = () => box4(slot);
    box = document.querySelector<HTMLDivElement>("#card-box")!;
    root = createRoot(box);
    let host: any = null;
    if (props.callStatus) {
      host = document.createElement("hanc-ai-pill-floating-call");
      host.callStatus = props.callStatus;
      document.body.appendChild(host);
    }
    await act(async () => root!.render(<AgentAvatarCard avatar={PACK} lang="en" host={host} slot>{createElement("hanc-ai-pill-floating-call", { position: "static" })}</AgentAvatarCard>));
    const card = document.querySelector<HTMLElement>(".avatar-card")!;
    // the card's box: the slot's in the hero, the dock's in the dock (the probe of the gate is an empty .avatar-card in the dock placement)
    card.getBoundingClientRect = () => box4(card.dataset.placement === "dock" ? DOCK : slot);
    const proto = Object.getPrototypeOf(document.createElement("div"));
    const native = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      return this.classList?.contains("avatar-card") && this.getAttribute("aria-hidden") === "true" ? box4(zone) : native.call(this);
    };
    return { card, host, slotEl };
  };
  const slotIO = () => ios.find((i) => i.targets.some((t) => t.hasAttribute("data-agent-slot")))!;
  const gateIO = () => ios.find((i) => i.options?.rootMargin !== undefined);
  const share = (r: number) => act(() => slotIO().cb([{ isIntersecting: r > 0, intersectionRatio: r, target: slotIO().targets[0] }], {}));
  const ghosts = () => Array.from(document.querySelectorAll<HTMLElement>(".card-ghost"));
  const ghostBox = (g: HTMLElement) => ({ left: parseFloat(g.style.left), top: parseFloat(g.style.top), width: parseFloat(g.style.width), height: parseFloat(g.style.height) });
  /** Runs the animation frames at `ms` after the flight began (the clock the ghost reads). */
  const fly = (ms: number) => {
    clock = 1000 + ms;
    const due = frames.splice(0);
    act(() => due.forEach((cb) => cb(clock)));
  };
  const first = async (props = {}) => {
    const p = await page(props);
    await share(1); // the first measurement: in the hero, no flight
    return p;
  };

  it("flies the ghost down into the dock: at once the real card is in the dock and its looks are hidden, the ghost starts on the slot and ends on the dock, then the card shows and the ghost fades out", async () => {
    const { card } = await first();
    expect(ghosts()).toHaveLength(0);
    await share(0.27);
    expect(card.dataset.placement).toBe("dock"); // switched at once, flushed
    expect(card.dataset.flight).toBe("dock");
    expect(ghosts()).toHaveLength(1);
    const g = ghosts()[0];
    expect(g.parentElement).toBe(document.body);
    expect(ghostBox(g)).toEqual(slot);
    fly(CARD_FLIGHT.ms / 2);
    const mid = ghostBox(g);
    expect(mid.left).toBeGreaterThan(slot.left);
    expect(mid.left).toBeLessThan(DOCK.left);
    expect(mid.width).toBeLessThan(slot.width);
    fly(CARD_FLIGHT.ms + 1);
    expect(ghostBox(g)).toEqual(DOCK);
    expect(card.dataset.flight).toBeUndefined(); // the real card is shown
    expect(g.style.opacity).toBe("0"); // the ghost fades out over it
    await act(async () => void (await new Promise((r) => setTimeout(r, CARD_FLIGHT.crossfadeMs + 80))));
    expect(ghosts()).toHaveLength(0);
  });

  it("releases the snapshot canvas after landing", async () => {
    await first();
    await share(0.1);
    const canvas = ghosts()[0].querySelector("canvas")!;
    expect(canvas.width).toBeGreaterThan(0);
    fly(CARD_FLIGHT.ms + 1);
    await act(async () => void (await new Promise((r) => setTimeout(r, CARD_FLIGHT.crossfadeMs + 80))));
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("enters from just above the top edge when the slot is already far beyond it (a fast scroll), on the right where the card is", async () => {
    const { card } = await first();
    slot = { left: 600, top: -3000, width: 400, height: 500 };
    await share(0);
    expect(card.dataset.placement).toBe("dock");
    expect(ghostBox(ghosts()[0])).toEqual({ left: 600, top: -500 * CARD_FLIGHT.entryAbove, width: 400, height: 500 });
    fly(CARD_FLIGHT.ms + 1);
    expect(ghostBox(ghosts()[0])).toEqual(DOCK);
  });

  it("flies back up from the dock into the slot at the same share, following the slot while the page still scrolls", async () => {
    const { card } = await first();
    await share(0);
    fly(CARD_FLIGHT.ms + 1);
    await act(async () => void (await new Promise((r) => setTimeout(r, CARD_FLIGHT.crossfadeMs + 80))));
    expect(ghosts()).toHaveLength(0);
    clock = 5000; // a later moment: the flight reads the clock when it starts
    await share(CARD_FLIGHT.trigger); // exactly the share: back
    expect(card.dataset.placement).toBe("hero");
    expect(card.dataset.flight).toBe("hero");
    expect(ghostBox(ghosts()[0])).toEqual(DOCK);
    slot = { left: 600, top: 200, width: 400, height: 500 }; // the page scrolled on during the flight
    fly(4000 + CARD_FLIGHT.ms + 1);
    expect(ghostBox(ghosts()[0])).toEqual(slot);
    expect(card.dataset.flight).toBeUndefined();
    // the page is still scrolling while the ghost fades: it stays on the real card (which is in the document) instead of sliding off it
    slot = { left: 600, top: 90, width: 400, height: 500 };
    fly(4000 + CARD_FLIGHT.ms + 100);
    expect(ghostBox(ghosts()[0])).toEqual(slot);
  });

  it("goes on from where the ghost is when the card is switched again in the air: one ghost, one card", async () => {
    const { card } = await first();
    await share(0.1);
    fly(150);
    const mid = ghostBox(ghosts()[0]);
    const g = ghosts()[0];
    await share(0.6); // back up before it has landed
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0]).toBe(g);
    expect(card.dataset.placement).toBe("hero");
    expect(card.dataset.flight).toBe("hero");
    expect(ghostBox(g)).toEqual(mid); // starts where it was
    fly(150 + CARD_FLIGHT.ms + 1);
    expect(ghostBox(g)).toEqual(slot);
    expect(document.querySelectorAll(".avatar-card")).toHaveLength(1);
  });

  it("is instant under reduced motion: no ghost, no flight attribute, the card switches at once", async () => {
    reduced = true;
    const { card } = await first();
    await share(0.1);
    expect(card.dataset.placement).toBe("dock");
    expect(ghosts()).toHaveLength(0);
    expect(card.dataset.flight).toBeUndefined();
    await share(0.9);
    expect(card.dataset.placement).toBe("hero");
    expect(ghosts()).toHaveLength(0);
  });

  it("the ghost has no widget, plate, bubble or captions, and is not an ancestor of the widget; the widget and the action area are never touched", async () => {
    const { card } = await first();
    const widget = card.querySelector("hanc-ai-pill-floating-call")!;
    const action = card.querySelector<HTMLElement>(".avatar-card__action")!;
    await share(0.1);
    const g = ghosts()[0];
    expect(g.contains(widget)).toBe(false);
    expect(g.querySelector("hanc-ai-pill-floating-call, .avatar-card__plate, .call-bubble, .avatar-card__captions, button, video")).toBeNull();
    expect(g.getAttribute("aria-hidden")).toBe("true");
    // in the air the widget is still in the card, the same node, and neither it nor its ancestors carry any style of the flight
    expect(card.querySelector("hanc-ai-pill-floating-call")).toBe(widget);
    for (let n: HTMLElement | null = widget as HTMLElement; n && n !== document.body; n = n.parentElement) {
      expect(n.style.visibility, n.className).toBe("");
      expect(n.style.opacity, n.className).toBe("");
      expect(n.style.transform, n.className).toBe("");
      expect(n.style.filter, n.className).toBe("");
      expect(n.style.getPropertyValue("contain"), n.className).toBe("");
    }
    expect(action.hasAttribute("data-flight")).toBe(false);
    fly(CARD_FLIGHT.ms + 1);
    for (let n: HTMLElement | null = widget as HTMLElement; n && n !== document.body; n = n.parentElement) {
      expect(n.style.transform, n.className).toBe("");
      expect(n.style.filter, n.className).toBe("");
    }
  });

  it("ends the flight at once when a call starts connecting: the real card is shown, the ghost is gone, and the next switch is instant", async () => {
    const { card, host } = await first({ callStatus: "idle" });
    await share(0.1);
    expect(ghosts()).toHaveLength(1);
    expect(card.dataset.flight).toBe("dock");
    host.callStatus = "connecting";
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    expect(ghosts()).toHaveLength(0);
    expect(card.dataset.flight).toBeUndefined();
    await share(0.9); // a call is on its way: no ghost for the next switch either
    expect(card.dataset.placement).toBe("hero");
    expect(ghosts()).toHaveLength(0);
    expect(card.dataset.flight).toBeUndefined();
  });

  it("ends the flight at once when the widget's form opens (a pointer arrives from outside the card's box)", async () => {
    const { card } = await first();
    await share(0.1);
    expect(ghosts()).toHaveLength(1);
    await act(async () => void card.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 })));
    expect(ghosts()).toHaveLength(0);
    expect(card.dataset.flight).toBeUndefined();
  });

  it("takes the ghost away when the card goes away", async () => {
    const { card } = await first();
    await share(0.1);
    expect(ghosts()).toHaveLength(1);
    act(() => root!.unmount());
    root = undefined;
    expect(ghosts()).toHaveLength(0);
    expect(card.dataset.flight).toBeUndefined();
  });

  describe("the gate: the card does not land on the hero's content", () => {
    const under = (on: boolean, i = 0) => act(() => gateIO()!.cb([{ isIntersecting: on, target: gateIO()!.targets[i] }], {}));

    it("watches the hero's blocks with the root shrunk to the dock's place (plus the clearance)", async () => {
      await first({ content: true });
      const c = CARD_FLIGHT.clearance;
      const vw = document.documentElement.clientWidth;
      expect(gateIO()!.targets.map((t) => t.className)).toEqual(["hero__description", "hero__facts"]);
      expect(gateIO()!.options.rootMargin).toBe([`-${zone.top - c}px`, `-${vw - (zone.left + zone.width) - c}px`, `-${window.innerHeight - (zone.top + zone.height) - c}px`, `-${zone.left - c}px`].join(" ").replace(/-(-?\d+)px/g, (_, n) => `-${Math.max(0, Number(n))}px`));
    });
    it("waits in the hero while something is under the dock's place, lands when it is clear", async () => {
      const { card } = await first({ content: true });
      await under(true);
      await share(0.1);
      expect(card.dataset.placement).toBe("hero");
      expect(ghosts()).toHaveLength(0);
      await under(false);
      expect(card.dataset.placement).toBe("dock");
      expect(ghosts()).toHaveLength(1);
    });
    it("docks regardless once the slot is fully off the screen, and then enters from above: the gate can never keep it in the hero for good", async () => {
      const { card } = await first({ content: true });
      await under(true);
      await share(0.1);
      expect(card.dataset.placement).toBe("hero");
      slot = { left: 600, top: -700, width: 400, height: 500 };
      await share(0);
      expect(card.dataset.placement).toBe("dock");
      expect(ghostBox(ghosts()[0]).top).toBe(-500 * CARD_FLIGHT.entryAbove);
    });
    it("does not hold the card back from returning to the hero (up) and has no effect on an empty dock place", async () => {
      const { card } = await first({ content: true });
      await share(0);
      expect(card.dataset.placement).toBe("dock");
      await under(true);
      await share(0.5);
      expect(card.dataset.placement).toBe("hero");
    });
    it("has no gate where the dock's place has no size (no layout)", async () => {
      zone = { left: 0, top: 0, width: 0, height: 0 };
      await first({ content: true });
      expect(gateIO()).toBeUndefined();
    });
  });
});
