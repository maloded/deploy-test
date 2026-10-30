// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { InviteCue, ResolvedAvatar } from "@/lib/avatar-manifest";
import { bubbleAllowed, bubbleOn, lettersAt, typeCut } from "@/lib/call-bubble";
import { bubbleTextOf, hasBubble } from "@/lib/avatar-view";
import type { WidgetHost } from "@/lib/hanc-bridge";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const CUE: InviteCue = { show: 0.58, hide: 2.45 };
const loop = (n: string) => ({ mp4: `/avatars/p/${n}.mp4` });
const PACK: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: loop("invite"), inviteCue: CUE, bubble: null, idle: null, listen: loop("l"), speak: loop("s"), caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: ["en", "de"], example: null, liveText: null };

describe("when the bubble is up (the invite loop's own clock)", () => {
  it("is on from cue.show up to, not including, cue.hide", () => {
    expect(bubbleOn(0, CUE)).toBe(false);
    expect(bubbleOn(0.579, CUE)).toBe(false);
    expect(bubbleOn(0.58, CUE)).toBe(true);
    expect(bubbleOn(1.5, CUE)).toBe(true);
    expect(bubbleOn(2.449, CUE)).toBe(true);
    expect(bubbleOn(2.45, CUE)).toBe(false);
    expect(bubbleOn(4.9, CUE)).toBe(false);
  });
  it("repeats with every loop: the video's time runs 0 to its length again", () => {
    const seen = [0.2, 0.7, 2.5, 4.99, 0.1, 0.6, 2.4, 2.6].map((t) => bubbleOn(t, CUE));
    expect(seen).toEqual([false, true, false, false, false, true, true, false]);
  });
  it("may be up only for a cue, a playing invite loop, no call and no form over the card", () => {
    const base = { cue: CUE, playing: true, callBusy: false, overlay: false };
    expect(bubbleAllowed(base)).toBe(true);
    expect(bubbleAllowed({ ...base, cue: null })).toBe(false);
    expect(bubbleAllowed({ ...base, playing: false })).toBe(false);
    expect(bubbleAllowed({ ...base, callBusy: true })).toBe(false);
    expect(bubbleAllowed({ ...base, overlay: true })).toBe(false);
  });
  it("has a text: the seller's, else \"Call me\" / \"Rufen Sie mich an\"", () => {
    expect(bubbleTextOf({ bubble: null }, "en")).toBe("Call me");
    expect(bubbleTextOf({ bubble: null }, "de")).toBe("Rufen Sie mich an");
    expect(bubbleTextOf({ bubble: { en: "Ring me", de: "Ruf an" } }, "de")).toBe("Ruf an");
  });
  it("exists only for an invite loop with a cue", () => {
    expect(hasBubble(PACK)).toBe(true);
    expect(hasBubble({ ...PACK, inviteCue: null })).toBe(false);
    expect(hasBubble({ ...PACK, invite: null })).toBe(false);
  });
});

describe("the typing (Hanc's: two stretches split at the space nearest 65%, 0.45 s, a pause of 0.1 s, 0.4 s)", () => {
  const LINE = "Rufen Sie mich an";
  it("cuts the line at the space nearest to 65% of it, as Hanc's sayCut does (\"Call me.\" is cut after \"Call \")", () => {
    expect(typeCut("Call me.")).toBe(5);
    expect(typeCut(LINE)).toBe(10);
    expect(typeCut("Ruf")).toBe(2); // no space: the rounded 65%
  });
  it("types nothing before cue.show, the first part by +0.45 s, holds, types the rest by +0.95 s, and has typed it all inside the cue", () => {
    const at = (dt: number) => lettersAt(CUE.show + dt, CUE, LINE);
    expect([at(-1), at(0)]).toEqual([0, 0]);
    expect(at(0.225)).toBe(5);
    expect([at(0.45), at(0.5), at(0.549)]).toEqual([10, 10, 10]);
    expect(at(0.75)).toBe(14);
    expect([at(0.95), at(1.5)]).toEqual([17, 17]);
    expect(CUE.show + 0.95).toBeLessThan(CUE.hide);
  });
  it("is Hanc's own number for its line: \"Call me.\" is typed 2.8 to 3.25 s and 3.35 to 3.75 s from the bubble coming up at 2.8 s", () => {
    const hanc = { show: 2.8, hide: 4.8 };
    expect([2.8, 3.025, 3.25, 3.3, 2.8 + 0.55, 3.55, 3.75].map((t) => lettersAt(t, hanc, "Call me."))).toEqual([0, 3, 5, 5, 5, 7, 8]);
  });
});

describe("the bubble on the card", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let frames: FrameRequestCallback[] = [];
  let reduced = false;
  let time = 0;
  let paused = false;

  beforeEach(() => {
    frames = [];
    reduced = false;
    time = 0;
    paused = false;
    (window as any).requestIdleCallback = (cb: () => void) => (cb(), 1);
    (window as any).cancelIdleCallback = () => {};
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => (frames.push(cb), frames.length);
    (window as any).cancelAnimationFrame = () => void (frames = []);
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("reduce") && reduced, addEventListener() {}, removeEventListener() {} });
    HTMLVideoElement.prototype.canPlayType = () => "" as CanPlayTypeResult;
    HTMLMediaElement.prototype.play = function (this: HTMLElement) {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = () => {};
    if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    document.body.innerHTML = "";
    root = box = undefined;
  });

  const mount = async (avatar: ResolvedAvatar = PACK, extra: { lang?: "en" | "de"; host?: WidgetHost | null; placement?: "hero" | "dock" } = {}) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={avatar} lang={extra.lang ?? "en"} host={extra.host ?? null} placement={extra.placement ?? "hero"}>x</AgentAvatarCard>));
    const card = document.querySelector<HTMLElement>(".avatar-card")!;
    card.getBoundingClientRect = () => ({ left: 100, top: 200, width: 400, height: 500, right: 500, bottom: 700, x: 100, y: 200, toJSON() {} }) as DOMRect;
    return card;
  };
  const invite = () => document.querySelector<HTMLVideoElement>('video[data-slot="invite"]');
  /** The invite video is on screen and playing, with a clock the test sets. */
  const playInvite = async () => {
    const v = invite()!;
    Object.defineProperty(v, "paused", { configurable: true, get: () => paused });
    Object.defineProperty(v, "currentTime", { configurable: true, get: () => time });
    await act(async () => void v.dispatchEvent(new Event("playing")));
  };
  const frame = () => act(() => void frames.splice(0).forEach((cb) => cb(0)));
  const bubble = () => document.querySelector<HTMLElement>(".call-bubble");

  it("is in the page for an invite loop with a cue: aria-hidden, no link and no button in it, its text in the page language", async () => {
    await mount(PACK, { lang: "de" });
    expect(bubble()!.getAttribute("aria-hidden")).toBe("true");
    expect(bubble()!.querySelector("a, button, input")).toBeNull();
    expect(bubble()!.textContent).toBe("Rufen Sie mich an");
    expect(bubble()!.dataset.on).toBe("false"); // down until the loop says so
    expect(document.querySelectorAll(".call-bubble")).toHaveLength(1);
  });

  it("uses the seller's text when there is one", async () => {
    await mount({ ...PACK, bubble: { en: "Ring me", de: "Ruf an" } });
    expect(bubble()!.textContent).toBe("Ring me");
  });

  it("is not there without a cue or without an invite loop", async () => {
    await mount({ ...PACK, inviteCue: null });
    expect(bubble()).toBeNull();
    act(() => root!.unmount());
    await mount({ ...PACK, invite: null });
    expect(bubble()).toBeNull();
  });

  it("follows the invite loop's clock: up at cue.show, down at cue.hide, again in the next loop", async () => {
    await mount();
    await playInvite();
    for (const [t, on] of [[0.2, false], [0.6, true], [2.0, true], [2.46, false], [4.5, false], [0.05, false], [0.7, true], [2.5, false]] as const) {
      time = t;
      await frame();
      expect(bubble()!.dataset.on, `t=${t}`).toBe(String(on));
    }
  });

  it("types its line while it is up: nothing at cue.show, whole by +0.95 s, whole on the way out, and again from nothing in the next loop", async () => {
    await mount(PACK, { lang: "de" });
    await playInvite();
    const typed = () => [bubble()!.querySelector("[data-typed]")!.textContent, bubble()!.querySelector("[data-rest]")!.textContent, bubble()!.textContent];
    time = 0.58;
    await frame();
    expect(typed()).toEqual(["", "Rufen Sie mich an", "Rufen Sie mich an"]); // the box has its full text from the start
    time = 0.58 + 0.225;
    await frame();
    expect(typed()).toEqual(["Rufen", " Sie mich an", "Rufen Sie mich an"]);
    time = 0.58 + 0.95;
    await frame();
    expect(typed()).toEqual(["Rufen Sie mich an", "", "Rufen Sie mich an"]);
    time = 2.46; // down: it leaves whole
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
    expect(typed()).toEqual(["Rufen Sie mich an", "", "Rufen Sie mich an"]);
    time = 0.05; // the next loop
    await frame();
    time = 0.58;
    await frame();
    expect(typed()).toEqual(["", "Rufen Sie mich an", "Rufen Sie mich an"]);
    expect(bubble()!.querySelector("[data-typed]")!.nextElementSibling!.className).toBe("call-bubble__rest");
  });

  it("is down when the video is paused (the tab is hidden, autoplay was refused), whatever its time says", async () => {
    await mount();
    await playInvite();
    time = 1;
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
    paused = true;
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
  });

  it("is down while a call connects, runs or has failed, and comes back when the call is over", async () => {
    const host = document.createElement("hanc-ai-pill-floating-call") as any;
    host.callStatus = "idle";
    document.body.appendChild(host);
    await mount(PACK, { host });
    await playInvite();
    time = 1;
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
    host.callStatus = "connecting";
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
    host.callStatus = "connected";
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
    expect(frames).toHaveLength(0); // no clock is read while a call is on
    host.callStatus = "idle"; // an ordinary end; the invite loop is on screen again
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    await playInvite();
    time = 1.2;
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
  });

  it("is down when a call starts by the document's call-start signal too (the card leaves the invite loop)", async () => {
    await mount();
    await playInvite();
    time = 1;
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
    await act(async () => void document.dispatchEvent(new Event("call-start", { bubbles: true })));
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
  });

  it("is down while the widget's form is open over the card (a pointer event arrives from outside the card's box) and back when the pointer leaves", async () => {
    const card = await mount();
    await playInvite();
    time = 1;
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
    const move = (x: number, y: number, type = "pointermove") => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      act(() => void card.dispatchEvent(e));
    };
    move(300, 400); // over the card itself: nothing
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
    move(900, 50); // a pointer outside the card's box that still reaches it: it came through the form
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
    act(() => void card.dispatchEvent(new Event("pointerleave")));
    await frame();
    expect(bubble()!.dataset.on).toBe("true");
  });

  it("is never up under reduced motion: the videos do not play, so the loop has no clock", async () => {
    reduced = true;
    await mount();
    expect(invite()).toBeNull();
    await frame();
    expect(bubble()!.dataset.on).toBe("false");
    expect(frames).toHaveLength(0);
  });

  it("is never up while the invite loop is not the one on screen (a pack without listen shows it, one with idle only does not)", async () => {
    await mount({ ...PACK, listen: null, speak: null, idle: loop("i") });
    await playInvite();
    time = 1;
    await frame();
    expect(bubble()!.dataset.on).toBe("true"); // waiting: the invite loop
  });

  it("is in the hero and on the docked card, which is where the CSS shows it (not in the circle); the card and its widget are the same elements", async () => {
    await mount(PACK, { placement: "hero" });
    const first = bubble();
    expect(first).not.toBeNull();
    act(() => root!.unmount());
    document.body.innerHTML = "";
    await mount(PACK, { placement: "dock" });
    expect(bubble()).not.toBeNull();
  });

  it("stops reading the clock when the card goes away", async () => {
    await mount();
    await playInvite();
    expect(frames.length).toBeGreaterThan(0);
    act(() => root!.unmount());
    root = undefined;
    expect(frames).toHaveLength(0);
  });

  it("renders nothing of its state on the server: down, aria-hidden", () => {
    const html = renderToStaticMarkup(<AgentAvatarCard avatar={PACK} lang="en" placement="dock">x</AgentAvatarCard>);
    expect(html).toContain('class="call-bubble" data-on="false" data-placement="dock" aria-hidden="true"');
  });
});

describe("the bubble's CSS", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = (selector: string, media = "") => {
    const re = new RegExp(`(^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
    if (!media) return re.exec(css)?.[2] ?? "";
    for (let at = css.indexOf(`@media ${media} {`); at >= 0; at = css.indexOf(`@media ${media} {`, at + 1)) {
      const found = re.exec(css.slice(at, css.indexOf("\n}\n", at)));
      if (found) return found[2];
    }
    return "";
  };

  it("is Hanc's bubble: the stage ink, a sharp corner at the top left, a ring-gradient phone disc, 260ms in and 180ms out", () => {
    const b = body(".call-bubble");
    expect(b).toMatch(/background: var\(--avatar-ink, white\)/);
    expect(b).toMatch(/border-radius: 0\.375em 1\.375em 1\.375em 1\.375em/);
    expect(b).toMatch(/padding: 0\.75em 1\.15em 0\.8em 0\.8em/);
    expect(b).toMatch(/font-weight: 800/);
    expect(b).toMatch(/transition-duration: 180ms/);
    expect(body('.call-bubble[data-on="true"]')).toMatch(/transition-duration: 260ms/);
    expect(body(".call-bubble__icon")).toMatch(/width: 2\.25em/);
    expect(body(".call-bubble__icon")).toMatch(/background: var\(--avatar-ring, /);
    expect(body('.call-bubble[data-on="true"]')).toMatch(/opacity: 1/);
    expect(b).toMatch(/opacity: 0/);
  });

  it("does nothing on click: no pointer events at all", () => {
    expect(body(".call-bubble")).toMatch(/pointer-events: none/);
  });

  it("rings the phone only when motion is welcome, and is not shown at all under reduced motion", () => {
    expect(body('.call-bubble[data-on="true"] .call-bubble__icon svg', "(prefers-reduced-motion: no-preference)")).toMatch(/animation: call-bubble-ring 900ms/);
    expect(body(".call-bubble__icon svg")).not.toMatch(/animation/);
    expect(body(".call-bubble", "(prefers-reduced-motion: reduce)")).toMatch(/display: none/);
  });

  it("is beside the face at mouth level, a third outside the card on the right, mirrored to the left when docked; not in the circle", () => {
    const hero = body('.call-bubble[data-placement="hero"]');
    expect(hero).toMatch(/top: 40%/);
    expect(hero).toMatch(/right: 0/);
    expect(hero).toMatch(/transform: translateX\(min\(33\.333%, max\(0rem, calc\(100vw - var\(--avatar-slot-x, 0rem\) - var\(--avatar-slot-w, 20rem\) - 1\.5rem\)\)\)\)/);
    const dock = body('.call-bubble[data-placement="dock"]');
    expect(dock).toMatch(/top: 40%/);
    expect(dock).toMatch(/left: 0/);
    expect(dock).toMatch(/transform: translateX\(-33\.333%\)/);
    expect(dock).toMatch(/border-radius: 1\.375em 0\.375em 1\.375em 1\.375em/);
    expect(body('.call-bubble[data-placement="dock"]', "(width < 40em), (height < 32.5em)")).toMatch(/display: none/);
  });

  it("is about 40% of the card: the em follows the card's width (Hanc's 1rem on 447px) and the letters are 1.625em", () => {
    expect(body(".call-bubble")).toMatch(/font-size: max\(calc\(var\(--bubble-card-w, 20rem\) \* 0\.0358\), 0\.5rem\)/);
    expect(body(".call-bubble__text")).toMatch(/font-size: 1\.625em/);
  });

  it("no rule of the card (.avatar-card*) carries a transform for it: they are on .call-bubble selectors, and it is never above the widget", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] })).filter((r) => /call-bubble/.test(r.selector));
    expect(rules.length).toBeGreaterThan(6);
    for (const r of rules) expect(r.selector.split(",").some((s) => /^\.avatar-card/.test(s.trim())) && /(^|;|\s)(transform|translate|scale|rotate|filter|backdrop-filter|will-change|contain)\s*:/.test(r.body), r.selector).toBe(false);
    expect(css).not.toMatch(/\.call-bubble[^{]*hanc-ai/);
  });
});
