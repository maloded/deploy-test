// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { activeSlot, isSingleLoop, loopSlots, motionAllowed, pickFormat, slotsToMount } from "@/lib/avatar-view";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const pack = (loops: Partial<Record<"idle" | "listen" | "speak", { mp4?: string; webm?: string }>> = {}): ResolvedAvatar => ({
  id: "test-pack",
  name: "Test pack",
  poster: "/avatars/test-pack/poster.webp",
  idle: loops.idle ?? null,
  listen: loops.listen ?? null,
  speak: loops.speak ?? null,
});
const mp4 = (n: string) => ({ mp4: `/avatars/test-pack/${n}.mp4` });
const FULL = pack({ idle: mp4("i"), listen: mp4("l"), speak: mp4("s") });

describe("what the card shows (the degradation table)", () => {
  it("poster only: always the poster", () => {
    for (const s of ["idle", "call", "speaking"] as const) expect(activeSlot(pack(), s)).toBeNull();
    expect(loopSlots(pack())).toEqual([]);
  });

  it("one loop: it plays in every state, whatever it is called", () => {
    for (const slot of ["idle", "listen", "speak"] as const) {
      const one = pack({ [slot]: mp4("x") });
      expect(isSingleLoop(one)).toBe(true);
      for (const s of ["idle", "call", "speaking"] as const) expect(activeSlot(one, s)).toBe(slot);
    }
  });

  it("a full pack switches: idle, listen, speak", () => {
    expect(activeSlot(FULL, "idle")).toBe("idle");
    expect(activeSlot(FULL, "call")).toBe("listen");
    expect(activeSlot(FULL, "speaking")).toBe("speak");
  });

  it("listen without speak: no speaking state, the call picture stays", () => {
    const p = pack({ idle: mp4("i"), listen: mp4("l") });
    expect(activeSlot(p, "call")).toBe("listen");
    expect(activeSlot(p, "speaking")).toBe("listen");
  });

  it("idle missing: the poster while waiting", () => {
    const p = pack({ listen: mp4("l"), speak: mp4("s") });
    expect(activeSlot(p, "idle")).toBeNull();
    expect(activeSlot(p, "call")).toBe("listen");
    expect(activeSlot(p, "speaking")).toBe("speak");
  });

  it("listen missing: the idle loop carries the call; speak still shows when the agent speaks", () => {
    const p = pack({ idle: mp4("i"), speak: mp4("s") });
    expect(activeSlot(p, "call")).toBe("idle");
    expect(activeSlot(p, "speaking")).toBe("speak");
  });
});

describe("what is loaded, and when", () => {
  const on = { motion: true, pageIdle: false, touched: false };
  it("nothing before the page is idle; the idle loop then; listen and speak only after a touch or a call", () => {
    expect(slotsToMount(FULL, on)).toEqual([]);
    expect(slotsToMount(FULL, { ...on, pageIdle: true })).toEqual(["idle"]);
    expect(slotsToMount(FULL, { ...on, pageIdle: true, touched: true })).toEqual(["idle", "listen", "speak"]);
    expect(slotsToMount(FULL, { ...on, touched: true })).toEqual(["listen", "speak"]);
  });

  it("a pack's only loop waits for the idle page, not for a touch", () => {
    expect(slotsToMount(pack({ speak: mp4("s") }), { ...on, pageIdle: true })).toEqual(["speak"]);
  });

  it("no motion, no video", () => {
    expect(slotsToMount(FULL, { motion: false, pageIdle: true, touched: true })).toEqual([]);
    expect(motionAllowed({ reducedMotion: true, saveData: false })).toBe(false);
    expect(motionAllowed({ reducedMotion: false, saveData: true })).toBe(false);
    expect(motionAllowed({ reducedMotion: false, saveData: false })).toBe(true);
  });

  it("one format per loop: WebM only when the browser can play it, never both", () => {
    const both = { mp4: "a.mp4", webm: "a.webm" };
    expect(pickFormat(both, true)).toBe("a.webm");
    expect(pickFormat(both, false)).toBe("a.mp4");
    expect(pickFormat({ mp4: "a.mp4" }, true)).toBe("a.mp4");
    expect(pickFormat({ webm: "a.webm" }, true)).toBe("a.webm");
    expect(pickFormat({ webm: "a.webm" }, false)).toBeNull();
  });
});

describe("the card in the DOM", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let idleCallbacks: (() => void)[] = [];
  let reduced = false;
  let webm = "probably";
  let plays: string[] = [];
  let pauses: string[] = [];

  beforeEach(() => {
    idleCallbacks = [];
    reduced = false;
    webm = "probably";
    plays = [];
    pauses = [];
    (window as any).requestIdleCallback = (cb: () => void) => (idleCallbacks.push(cb), idleCallbacks.length);
    (window as any).cancelIdleCallback = () => {};
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("reduce") && reduced, addEventListener() {}, removeEventListener() {} });
    HTMLVideoElement.prototype.canPlayType = () => webm as CanPlayTypeResult;
    HTMLMediaElement.prototype.play = function (this: HTMLElement) {
      plays.push(this.getAttribute("data-slot") ?? "");
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLElement) {
      pauses.push(this.getAttribute("data-slot") ?? "");
    };
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    document.body.innerHTML = "";
  });

  const mount = async (avatar: ResolvedAvatar = FULL, child: React.ReactNode = <button id="start">Start</button>) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={avatar}>{child}</AgentAvatarCard>));
  };
  const card = () => document.querySelector<HTMLElement>(".avatar-card")!;
  const videos = () => [...document.querySelectorAll<HTMLVideoElement>("video")];
  const runIdle = () => act(async () => idleCallbacks.splice(0).forEach((cb) => cb()));
  const dispatch = (type: string, el: Element = card()) => act(async () => void el.dispatchEvent(new Event(type, { bubbles: true })));

  it("renders the poster and the start button first, and no video", async () => {
    await mount();
    expect(card().getAttribute("aria-label")).toBe("Test pack");
    expect(card().querySelector("img")!.getAttribute("src")).toBe("/avatars/test-pack/poster.webp");
    expect(card().querySelector("#start")).not.toBeNull();
    expect(videos()).toHaveLength(0);
  });

  it("server markup has the poster and no video at all", () => {
    const html = renderToStaticMarkup(<AgentAvatarCard avatar={FULL}>{null}</AgentAvatarCard>);
    expect(html).toContain("avatar-card__poster");
    expect(html).not.toContain("<video");
  });

  it("loads the idle loop when the page is idle, and listen and speak at the first pointerdown", async () => {
    await mount();
    await runIdle();
    expect(videos().map((v) => v.dataset.slot)).toEqual(["idle"]);
    expect(videos()[0].getAttribute("src")).toBe("/avatars/test-pack/i.mp4");
    expect(videos()[0].hasAttribute("loop") && videos()[0].muted).toBe(true);
    await dispatch("pointerdown");
    expect(videos().map((v) => v.dataset.slot)).toEqual(["idle", "listen", "speak"]);
  });

  // React derives onPointerEnter from pointerover and onFocus from focusin
  it.each(["pointerover", "focusin"])("%s also counts as a touch", async (type) => {
    await mount();
    await runIdle();
    expect(videos()).toHaveLength(1);
    await dispatch(type, card().querySelector("#start")!);
    expect(videos()).toHaveLength(3);
  });

  it("plays only the shown loop and crossfades by data-active once it is playing", async () => {
    await mount();
    await runIdle();
    expect(plays).toContain("idle");
    expect(videos()[0].dataset.active).toBe("false"); // not playing yet: the poster still shows
    await act(async () => void videos()[0].dispatchEvent(new Event("playing")));
    expect(videos()[0].dataset.active).toBe("true");
  });

  it("follows a call and the agent: listen while the call runs, speak while the agent speaks", async () => {
    await mount();
    await runIdle();
    plays.length = 0;
    await act(async () => void document.dispatchEvent(new Event("call-start", { bubbles: true })));
    expect(card().dataset.state).toBe("call");
    expect(videos().map((v) => v.dataset.slot)).toEqual(["idle", "listen", "speak"]); // a call loads them even before any touch
    expect(plays).toContain("listen");
    await act(async () => void document.dispatchEvent(new CustomEvent("agent-command", { detail: { type: "agent_state", payload: { state: "speaking" } } })));
    expect(card().dataset.state).toBe("speaking");
    expect(plays).toContain("speak");
    await act(async () => void document.dispatchEvent(new Event("call-end", { bubbles: true })));
    expect(card().dataset.state).toBe("idle");
  });

  it("without agent_state a call stays on the listen loop", async () => {
    await mount();
    await runIdle();
    plays.length = 0;
    await act(async () => void document.dispatchEvent(new Event("call-start", { bubbles: true })));
    expect(plays).toContain("listen");
    expect(plays).not.toContain("speak");
  });

  it("poster only with prefers-reduced-motion", async () => {
    reduced = true;
    await mount();
    await runIdle();
    await dispatch("pointerdown");
    expect(videos()).toHaveLength(0);
    expect(card().querySelector("img")).not.toBeNull();
  });

  it("poster only with Save-Data", async () => {
    (navigator as any).connection = { saveData: true };
    try {
      await mount();
      await runIdle();
      expect(videos()).toHaveLength(0);
    } finally {
      delete (navigator as any).connection;
    }
  });

  it("picks WebM only where the browser can play VP9 in it, and loads one file", async () => {
    const both = pack({ idle: { mp4: "/a/i.mp4", webm: "/a/i.webm" } });
    await mount(both);
    await runIdle();
    expect(videos()[0].getAttribute("src")).toBe("/a/i.webm");
    expect(videos()[0].querySelectorAll("source")).toHaveLength(0);
    act(() => root!.unmount());
    root = undefined;
    box!.remove();
    webm = "";
    await mount(both);
    await runIdle();
    expect(videos()[0].getAttribute("src")).toBe("/a/i.mp4");
  });

  it("drops a video that fails and keeps the poster and the other loops", async () => {
    await mount();
    await runIdle();
    await dispatch("pointerdown");
    await act(async () => void videos().find((v) => v.dataset.slot === "listen")!.dispatchEvent(new Event("error")));
    expect(videos().map((v) => v.dataset.slot)).toEqual(["idle", "speak"]);
    expect(card().querySelector("img")).not.toBeNull();
  });

  it("pauses the videos while the tab is hidden and resumes the shown one when it is back", async () => {
    await mount();
    await runIdle();
    pauses.length = 0;
    plays.length = 0;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(pauses).toContain("idle");
    expect(plays).toEqual([]);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(plays).toContain("idle");
  });
});

describe("on the page", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  const site = (agent: Record<string, unknown> | undefined, avatar: ResolvedAvatar | null = null) => {
    const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    return { ...s, seller: { ...s.seller, agent } as any, avatar };
  };
  const mount = (s: ReturnType<typeof site>) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    return act(async () => root!.render(<ProductLayout site={s} />));
  };
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
  });
  const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };

  it("with an avatar the card holds the widget as <hanc-ai-pill-floating-call position=static>, once, whatever variant and placement say", async () => {
    for (const a of [agent, { ...agent, variant: "floating" }, { ...agent, variant: "inline", placement: "top" }, { ...agent, variant: "inline", placement: "bottom" }]) {
      await mount(site(a, FULL));
      expect(document.querySelectorAll(".avatar-card")).toHaveLength(1);
      const widget = document.querySelector(".avatar-card hanc-ai-pill-floating-call")!;
      expect(widget.getAttribute("position")).toBe("static");
      expect(widget.getAttribute("agent-id")).toBe("test-agent-id");
      expect(document.querySelectorAll("hanc-ai-pill-floating-call, hanc-ai-pill-call, hanc-ai-inline-call")).toHaveLength(1);
      expect(document.querySelector(".agent-strip, .site-header__widget")).toBeNull();
      act(() => root!.unmount());
      box!.remove();
      root = undefined;
    }
  });

  it("without an avatar nothing changes: no card, the variants and placements render as before", async () => {
    await mount(site(agent, null));
    expect(document.querySelector(".avatar-card")).toBeNull();
    expect(document.querySelector(".site-header__widget hanc-ai-pill-call")).not.toBeNull();
    act(() => root!.unmount());
    box!.remove();
    await mount(site({ ...agent, variant: "floating" }, null));
    expect(document.querySelector(".avatar-card")).toBeNull();
    expect(document.querySelector("hanc-ai-pill-floating-call")!.getAttribute("position")).toBe("bottom-right");
    expect(renderToStaticMarkup(<ProductLayout site={site(undefined, null)} />)).not.toContain("avatar-card");
  });

  it("the footer keeps room for the card, and for the floating pill as before", () => {
    expect(renderToStaticMarkup(<ProductLayout site={site(agent, FULL)} />)).toContain("site-footer--agent-card");
    const floating = renderToStaticMarkup(<ProductLayout site={site({ ...agent, variant: "floating" }, null)} />);
    expect(floating).toContain("site-footer--agent-floating");
    expect(floating).not.toContain("site-footer--agent-card");
    expect(renderToStaticMarkup(<ProductLayout site={site(undefined, null)} />)).not.toMatch(/site-footer--agent/);
  });

  it("the card is not rendered for a seller without an agent, even if an avatar were resolved", () => {
    expect(renderToStaticMarkup(<ProductLayout site={site(undefined, FULL)} />)).not.toContain("avatar-card");
  });

  it("keeps a contact link in the card when the widget package cannot be loaded", async () => {
    vi.resetModules();
    vi.doMock("hanc-webrtc-widgets", () => {
      throw new Error("offline");
    });
    const { default: Layout } = await import("@/components/ProductLayout");
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<Layout site={site(agent, FULL)} />));
    await act(async () => {});
    expect(document.querySelector(".avatar-card hanc-ai-pill-floating-call")).toBeNull();
    const link = document.querySelector<HTMLAnchorElement>(".avatar-card a[href='#contact']")!;
    expect(link.dataset.requestType).toBeTruthy();
    vi.doUnmock("hanc-webrtc-widgets");
  });
});
