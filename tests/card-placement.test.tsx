// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { CARD_FLIGHT } from "@/lib/card-flight";
import type { WidgetHost } from "@/lib/hanc-bridge";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const EXAMPLE = { en: [{ speaker: "caller" as const, text: "Hello there." }, { speaker: "agent" as const, text: "Hi." }] };
const loop = (n: string) => ({ mp4: `/avatars/p/${n}.mp4` });
const PACK: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: loop("i"), listen: loop("l"), speak: loop("s"), caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en"], example: EXAMPLE, liveText: null };

type Observer = { cb: any; targets: Element[]; options?: any };
let ios: Observer[] = [];
let ros: Observer[] = [];

describe("the card's placement: hero or dock, one element for the whole page", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let rect = { left: 600, top: 120, width: 420, height: 525 };
  let scrollY = 0;

  beforeEach(() => {
    ios = [];
    ros = [];
    (window as any).IntersectionObserver = class {
      o: Observer;
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
      o: Observer;
      constructor(cb: any) {
        this.o = { cb, targets: [] };
        ros.push(this.o);
      }
      observe(el: Element) {
        this.o.targets.push(el);
      }
      disconnect() {
        ros = ros.filter((r) => r !== this.o);
      }
      unobserve() {}
    };
    (window as any).requestIdleCallback = (cb: () => void) => (cb(), 1);
    (window as any).cancelIdleCallback = () => {};
    (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    rect = { left: 600, top: 120, width: 420, height: 525 };
    scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
    if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    document.body.innerHTML = "";
    root = box = undefined;
  });

  /** A page with the hero (#hero) holding the slot, and the card after it, as ProductLayout lays them out. */
  const page = async (props: { slot?: boolean; withSlot?: boolean; avatar?: ResolvedAvatar; host?: WidgetHost | null; callStatus?: string } = {}) => {
    document.body.innerHTML = '<main><section id="hero"><div data-agent-slot="true"></div></section></main><div id="card-box"></div>';
    if (props.withSlot !== false) document.querySelector<HTMLElement>("[data-agent-slot]")!.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
    else document.querySelector("[data-agent-slot]")!.remove();
    box = document.querySelector<HTMLDivElement>("#card-box")!;
    root = createRoot(box);
    let host = props.host ?? null;
    if (props.callStatus) {
      host = document.createElement("hanc-ai-pill-floating-call") as any;
      (host as any).callStatus = props.callStatus;
      document.body.appendChild(host!);
    }
    await act(async () => root!.render(<AgentAvatarCard avatar={props.avatar ?? PACK} lang="en" host={host} slot={props.slot ?? true}>{createElement("hanc-ai-pill-floating-call", { position: "static" })}</AgentAvatarCard>));
    return document.querySelector<HTMLElement>(".avatar-card")!;
  };
  const slotIO = () => ios.find((i) => i.targets.some((t) => t.hasAttribute("data-agent-slot")))!;
  /** The slot's observer reports `share` of the slot on screen (the card is in the hero from CARD_FLIGHT.trigger up). */
  const share = (r: number) => act(() => slotIO().cb([{ isIntersecting: r > 0, intersectionRatio: r, target: slotIO().targets[0] }], {}));
  const visible = (on: boolean) => share(on ? 1 : 0);
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const settle = async () => act(async () => void (await frame()));

  it("the server renders the hero placement hidden when the page has the hero block, and the docked card visible when it has none", () => {
    const withHero = renderToStaticMarkup(<AgentAvatarCard avatar={PACK} lang="en" slot>x</AgentAvatarCard>);
    expect(withHero).toContain('data-placement="hero"');
    expect(withHero).toContain('data-ready="false"');
    const without = renderToStaticMarkup(<AgentAvatarCard avatar={PACK} lang="en">x</AgentAvatarCard>);
    expect(without).toContain('data-placement="dock"');
    expect(without).toContain('data-ready="true"');
  });

  it("stays hidden until the first measurement, then is in the hero at the slot's place and width (document coordinates)", async () => {
    scrollY = 300;
    const card = await page();
    expect(card.dataset.ready).toBe("false");
    expect(card.dataset.placement).toBe("hero");
    expect(card.style.getPropertyValue("--avatar-slot-x")).toBe("");
    await visible(true);
    expect(card.dataset.ready).toBe("true");
    expect(card.dataset.placement).toBe("hero");
    expect(card.style.getPropertyValue("--avatar-slot-x")).toBe("600px");
    expect(card.style.getPropertyValue("--avatar-slot-y")).toBe("420px"); // the slot's top + the scroll offset: a place in the document
    expect(card.style.getPropertyValue("--avatar-slot-w")).toBe("420px");
  });

  it("docks when the hero has left the screen and returns when it comes back, instantly and as often as it likes", async () => {
    const card = await page();
    await visible(true);
    await visible(false);
    expect(card.dataset.placement).toBe("dock");
    expect(card.dataset.ready).toBe("true");
    await visible(true);
    expect(card.dataset.placement).toBe("hero");
    await visible(false);
    await visible(true);
    await visible(false);
    expect(card.dataset.placement).toBe("dock");
  });

  it("starts docked when the page loads below the hero", async () => {
    const card = await page();
    await visible(false);
    expect(card.dataset.placement).toBe("dock");
    expect(card.dataset.ready).toBe("true");
  });

  it("watches the slot (not the whole hero), with the thresholds 0 and the trigger: the card is in the hero from 28% of the slot on screen", async () => {
    await page();
    expect(slotIO().targets.map((t) => t.hasAttribute("data-agent-slot"))).toEqual([true]);
    expect(ios.flatMap((i) => i.targets).some((t) => t.id === "hero")).toBe(false);
    expect(slotIO().options.threshold).toEqual([0, CARD_FLIGHT.trigger]);
    expect(CARD_FLIGHT.trigger).toBeGreaterThanOrEqual(0.25);
    expect(CARD_FLIGHT.trigger).toBeLessThanOrEqual(0.3);
  });

  it("docks below the trigger share of the slot and returns at it, in both directions (the same share)", async () => {
    const card = await page();
    await share(0.6);
    expect(card.dataset.placement).toBe("hero");
    await share(CARD_FLIGHT.trigger + 0.01);
    expect(card.dataset.placement).toBe("hero");
    await share(CARD_FLIGHT.trigger - 0.01);
    expect(card.dataset.placement).toBe("dock");
    await share(CARD_FLIGHT.trigger - 0.2);
    expect(card.dataset.placement).toBe("dock");
    await share(CARD_FLIGHT.trigger); // exactly the share: back
    expect(card.dataset.placement).toBe("hero");
    await share(0);
    expect(card.dataset.placement).toBe("dock");
  });

  it("is ONE element for the whole page life: the card, the frame, the widget and the videos keep their identity across switches", async () => {
    const card = await page();
    await visible(true);
    await act(async () => void card.dispatchEvent(new Event("pointerenter"))); // a touch mounts the listen and speak loops too
    const nodes = () => [card, ...card.querySelectorAll("*")].filter((n) => !n.closest(".avatar-card__captions"));
    const before = nodes();
    const widget = card.querySelector("hanc-ai-pill-floating-call")!;
    const videos = Array.from(card.querySelectorAll("video"));
    expect(videos.length).toBeGreaterThan(0);
    for (const on of [false, true, false, true]) await visible(on);
    expect(document.querySelector(".avatar-card")).toBe(card);
    expect(document.querySelectorAll(".avatar-card")).toHaveLength(1);
    expect(card.querySelector("hanc-ai-pill-floating-call")).toBe(widget);
    expect(Array.from(card.querySelectorAll("video"))).toEqual(videos); // the same <video> nodes: nothing restarts
    // every node that was there (except the example, which exists in the hero only) is still the same node
    for (const n of before) expect(n.isConnected).toBe(true);
  });

  it("a call that is on goes on through the switches: the widget is not touched and the card keeps the call's state", async () => {
    const removed = vi.fn();
    const card = await page({ callStatus: "connected" });
    const host = document.body.querySelector(":scope > hanc-ai-pill-floating-call") as any;
    const mo = new MutationObserver((records) => records.forEach((r) => r.removedNodes.forEach((n) => n === host && removed())));
    mo.observe(document.body, { childList: true, subtree: true });
    await visible(true);
    await act(async () => void (await new Promise((r) => setTimeout(r, 200))));
    expect(card.dataset.call).toBe("connected");
    await visible(false);
    expect(card.dataset.placement).toBe("dock");
    expect(card.dataset.call).toBe("connected");
    await visible(true);
    expect(card.dataset.call).toBe("connected");
    expect(host.isConnected).toBe(true);
    expect(removed).not.toHaveBeenCalled();
    mo.disconnect();
  });

  it("the example call is in the hero only: gone when docked (and its timers with it), back when the hero returns", async () => {
    const card = await page();
    await visible(true);
    expect(card.querySelector(".avatar-card__captions")).not.toBeNull();
    await visible(false);
    expect(card.querySelector(".avatar-card__captions")).toBeNull();
    await visible(true);
    expect(card.querySelector(".avatar-card__captions")).not.toBeNull();
  });

  it("measures again when the slot or the page changes size, and on window resize, never on scroll", async () => {
    const card = await page();
    await visible(true);
    rect = { left: 640, top: 100, width: 380, height: 475 };
    act(() => ros.forEach((r) => r.cb([], {})));
    await settle();
    expect(card.style.getPropertyValue("--avatar-slot-x")).toBe("640px");
    expect(card.style.getPropertyValue("--avatar-slot-w")).toBe("380px");
    expect(ros.flatMap((r) => r.targets).map((t) => t.id || t.tagName.toLowerCase())).toEqual(expect.arrayContaining(["hero", "body", "div"]));
    rect = { left: 500, top: 100, width: 380, height: 475 };
    window.dispatchEvent(new Event("resize"));
    await settle();
    expect(card.style.getPropertyValue("--avatar-slot-x")).toBe("500px");
    rect = { left: 1, top: 1, width: 1, height: 1 };
    scrollY = 900;
    window.dispatchEvent(new Event("scroll"));
    await settle();
    expect(card.style.getPropertyValue("--avatar-slot-x")).toBe("500px"); // a scroll moves nothing: the card scrolls with the page by itself
  });

  it("hands the row's height to the CSS as --hero-slot-h (the slot's width is 0.8 of it) and measures it again when the row changes", async () => {
    await page();
    const hero = document.getElementById("hero")!; // the slot's parent here, as .hero__top is in the real page
    let height = 600;
    hero.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height, right: 1200, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
    await visible(true);
    expect(hero.style.getPropertyValue("--hero-slot-h")).toBe("600px");
    height = 520;
    act(() => ros.forEach((r) => r.cb([], {})));
    await settle();
    expect(hero.style.getPropertyValue("--hero-slot-h")).toBe("520px");
    expect(ros.flatMap((r) => r.targets)).toContain(hero);
  });

  it("without a slot in the page the card stays docked and shows", async () => {
    const card = await page({ withSlot: false });
    await settle();
    expect(card.dataset.placement).toBe("dock");
    expect(card.dataset.ready).toBe("true");
    expect(ios.some((i) => i.targets.some((t) => t.hasAttribute("data-agent-slot")))).toBe(false);
  });

  it("a pinned placement skips the observers", async () => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={PACK} lang="en" slot placement="dock">x</AgentAvatarCard>));
    const card = document.querySelector<HTMLElement>(".avatar-card")!;
    expect(card.dataset.placement).toBe("dock");
    expect(card.dataset.ready).toBe("true");
    expect(ios.some((i) => i.targets.some((t) => t.hasAttribute("data-agent-slot")))).toBe(false);
  });

  it("stops observing when the card goes away", async () => {
    await page();
    await visible(true);
    act(() => root!.unmount());
    root = undefined;
    expect(ios.some((i) => i.targets.some((t) => t.hasAttribute("data-agent-slot")))).toBe(false);
    expect(ros).toHaveLength(0);
  });
});
