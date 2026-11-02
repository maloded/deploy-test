// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const mp4 = (n: string) => ({ mp4: `/avatars/p/${n}.mp4` });
const PACK = (over: Partial<ResolvedAvatar> = {}): ResolvedAvatar => ({
  id: "p",
  name: "Sofia",
  poster: "/avatars/p/poster.webp",
  invite: mp4("invite"),
  inviteCue: null,
  bubble: null,
  idle: null,
  listen: mp4("listen"),
  speak: mp4("speak"),
  caption: null,
  startLabel: null,
  endLabel: null,
  buttonIcon: "orb",
  role: { en: "Sales Rep", de: "Verkaufsberaterin" },
  languages: ["de", "en"],
  example: { en: [{ speaker: "agent", text: "EXAMPLE-LINE" }] },
  liveText: null,
  dark: null,
  ...over,
});

let root: Root | undefined;
let box: HTMLDivElement | undefined;
let ios: { cb: IntersectionObserverCallback; targets: Element[]; options?: IntersectionObserverInit }[] = [];

beforeEach(() => {
  ios = [];
  (window as any).IntersectionObserver = class {
    entry = { cb: null as unknown as IntersectionObserverCallback, targets: [] as Element[], options: undefined as IntersectionObserverInit | undefined };
    constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.entry.cb = cb;
      this.entry.options = options;
      ios.push(this.entry);
    }
    observe(t: Element) {
      this.entry.targets.push(t);
    }
    unobserve() {}
    disconnect() {
      this.entry.targets = [];
    }
  };
  (window as any).requestIdleCallback = (cb: () => void) => (cb(), 1);
  (window as any).cancelIdleCallback = () => {};
  (window as any).matchMedia = (q: string) => ({ matches: false && q.includes("reduce"), addEventListener() {}, removeEventListener() {} });
  HTMLVideoElement.prototype.canPlayType = () => "" as CanPlayTypeResult;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount(avatar: ResolvedAvatar, { lang = "de", callStatus = "idle", theme }: { lang?: "de" | "en"; callStatus?: string; theme?: string } = {}) {
  document.body.innerHTML = '<main><section id="hero"><div data-agent-slot="true"></div></section><section data-block="offer"></section></main><footer data-block="footer"></footer><div id="box"></div>';
  box = document.querySelector<HTMLDivElement>("#box")!;
  const host: any = document.createElement("hanc-ai-pill-floating-call");
  host.callStatus = callStatus;
  document.body.appendChild(host);
  root = createRoot(box);
  await act(async () => root!.render(<AgentAvatarCard avatar={avatar} lang={lang} host={host} theme={theme}>{createElement("hanc-ai-pill-floating-call", { position: "static" })}</AgentAvatarCard>));
  return { host, card: document.querySelector<HTMLElement>(".avatar-card")!, bar: () => document.querySelector<HTMLElement>(".avatar-card__bar")! };
}
const settle = (ms = 200) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const text = (el: Element | null) => el?.textContent ?? "";
/** Waits (real time) until the condition holds, at most `ms`. */
const until = async (ok: () => boolean, ms = 3000) => {
  for (let t = 0; t < ms && !ok(); t += 100) await settle(100);
};

describe("the call bar in the card", () => {
  it("holds her face, two lines of text and the call button, as a group named from the UI strings", async () => {
    const { bar } = await mount(PACK());
    expect(bar().getAttribute("role")).toBe("group");
    expect(bar().getAttribute("aria-label")).toBe("Sofia, Sprachassistentin");
    expect([...bar().children].map((c) => c.className)).toEqual(["avatar-card__face", "avatar-card__bar-text", "avatar-card__bar-button"]);
    expect(bar().querySelector(".avatar-card__face")!.getAttribute("aria-label")).toBe("Sofia anzeigen");
    expect(bar().querySelector<HTMLImageElement>(".avatar-card__face-img")!.getAttribute("src")).toBe("/avatars/p/poster.webp");
    expect(bar().querySelector(".avatar-card__bar-button .call-orb")).not.toBeNull(); // the same component as the card's button
    expect(bar().querySelector(".avatar-card__bar-button .call-orb")!.getAttribute("data-bar")).toBe("true");
  });

  it("waiting: the name, the role, her invitation; and no example conversation", async () => {
    const { bar } = await mount(PACK());
    expect(text(bar().querySelector(".avatar-card__bar-title b"))).toBe("Sofia");
    expect(text(bar().querySelector(".avatar-card__bar-title small"))).toBe("Verkaufsberaterin");
    expect(text(bar().querySelector(".avatar-card__bar-line"))).toBe("Fragen? Rufen Sie an");
    expect(text(bar())).not.toContain("EXAMPLE-LINE");
    expect(bar().dataset.kind).toBe("idle");
  });

  it("english", async () => {
    const { bar } = await mount(PACK(), { lang: "en" });
    expect(text(bar().querySelector(".avatar-card__bar-line"))).toBe("Questions? Call me");
    expect(bar().querySelector(".avatar-card__face")!.getAttribute("aria-label")).toBe("Show Sofia");
  });

  it("connecting: 'Verbinde…' over the hint; the face stays the poster (no video)", async () => {
    const { bar, host } = await mount(PACK());
    host.callStatus = "connecting";
    await settle();
    expect(bar().dataset.kind).toBe("connecting");
    expect(text(bar().querySelector(".avatar-card__bar-title b"))).toBe("Verbinde…");
    expect(text(bar().querySelector(".avatar-card__bar-line"))).toBe("Mikrofon erlauben");
    expect(bar().querySelector("video")).toBeNull();
  });

  it("has no live dot on the face in a call (the dot before the words 'Live-Anruf' is the text's own)", async () => {
    const { bar, host } = await mount(PACK());
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    await settle();
    expect(bar().dataset.kind).toBe("live");
    expect(bar().querySelector(".avatar-card__face-live")).toBeNull();
    expect(bar().querySelector(".avatar-card__face")!.children.length).toBe(3); // the poster and the two loops, nothing else
  });

  it("a live call: 'Live call' and a timer that counts, 'Sofia hört zu…', the face plays the loops (listen shown, speak behind it)", async () => {
    const { bar, host } = await mount(PACK());
    host.callStatus = "connecting";
    await settle();
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    await settle();
    expect(bar().dataset.kind).toBe("live");
    expect(text(bar().querySelector(".avatar-card__bar-title b"))).toBe("Live-Anruf");
    expect(text(bar().querySelector(".avatar-card__bar-timer"))).toBe("00:00");
    expect(text(bar().querySelector(".avatar-card__bar-line"))).toBe("Sofia hört zu…");
    expect([...bar().querySelectorAll("video")].map((v) => v.dataset.slot)).toEqual(["listen", "speak"]);
    for (const v of bar().querySelectorAll("video")) {
      expect((v as HTMLVideoElement).muted).toBe(true);
      expect(v.hasAttribute("loop")).toBe(true);
    }
    await until(() => text(bar().querySelector(".avatar-card__bar-timer")) === "00:01");
    expect(text(bar().querySelector(".avatar-card__bar-timer"))).toBe("00:01");
  });

  it("speaking: the second line changes, and the speaking loop is the one shown (crossfade by data-active)", async () => {
    const { bar, host } = await mount(PACK());
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("agent-command", { detail: { type: "agent_state", payload: { state: "speaking" } } }));
    await settle();
    expect(text(bar().querySelector(".avatar-card__bar-line"))).toBe("Sofia spricht…");
    for (const v of bar().querySelectorAll("video")) await act(async () => void v.dispatchEvent(new Event("playing")));
    const active = [...bar().querySelectorAll<HTMLVideoElement>("video")].map((v) => `${v.dataset.slot}:${v.dataset.active}`);
    expect(active).toEqual(["listen:false", "speak:true"]);
  });

  it("the timer starts again at 0 for the next call", async () => {
    const { bar, host } = await mount(PACK());
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    await until(() => text(bar().querySelector(".avatar-card__bar-timer")) === "00:01");
    expect(text(bar().querySelector(".avatar-card__bar-timer"))).toBe("00:01");
    host.callStatus = "idle";
    document.dispatchEvent(new CustomEvent("call-end", { bubbles: true }));
    await until(() => bar().dataset.kind === "idle");
    expect(bar().dataset.kind).toBe("idle");
    expect(bar().querySelector(".avatar-card__bar-timer")).toBeNull();
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    await until(() => bar().dataset.kind === "live");
    expect(text(bar().querySelector(".avatar-card__bar-timer"))).toBe("00:00");
  });

  it("an error: a word and 'Erneut versuchen'", async () => {
    const { bar, host } = await mount(PACK());
    host.callStatus = "connecting";
    await settle();
    host.callStatus = "error";
    await settle();
    expect(bar().dataset.kind).toBe("error");
    expect(text(bar().querySelector(".avatar-card__bar-title b"))).toBe("Fehlgeschlagen");
    expect(text(bar().querySelector(".avatar-card__bar-line"))).toBe("Erneut versuchen");
  });

  it("the text is a polite live region; the button's own status message is not repeated (the text already says it)", async () => {
    const { bar, card } = await mount(PACK());
    expect(bar().querySelector(".avatar-card__bar-text")!.getAttribute("aria-live")).toBe("polite");
    expect(bar().querySelector(".sr-only")).toBeNull();
    expect(card.querySelectorAll(".avatar-card__bar-text").length).toBe(1);
  });

  it("the dark theme's poster is the face (and the dark loops play in a call)", async () => {
    document.documentElement.setAttribute("data-theme", "dark-premium");
    const dark = { poster: "/avatars/p/poster.dark.webp", invite: null, idle: null, listen: mp4("listen.dark"), speak: mp4("speak.dark") };
    const { bar, host } = await mount(PACK({ dark }), { theme: "dark-premium" });
    expect(bar().querySelector(".avatar-card__face-img")!.getAttribute("src")).toBe("/avatars/p/poster.dark.webp");
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    await settle();
    expect([...bar().querySelectorAll("video")].map((v) => v.getAttribute("src"))).toEqual(["/avatars/p/listen.dark.mp4", "/avatars/p/speak.dark.mp4"]);
  });

  it("a tap on the face scrolls to the full card (the hero's slot, centred), smoothly", async () => {
    const { bar } = await mount(PACK());
    const slot = document.querySelector<HTMLElement>("[data-agent-slot]")!;
    const scroll = vi.fn();
    slot.scrollIntoView = scroll;
    await act(async () => void bar().querySelector<HTMLButtonElement>(".avatar-card__face")!.click());
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("only for the orb button (the other icons keep their pill), and not without a page language", async () => {
    const { card } = await mount(PACK({ buttonIcon: "dot" }));
    expect(card.querySelector(".avatar-card__bar")).toBeNull();
    const html = renderToStaticMarkup(<AgentAvatarCard avatar={PACK()}>{null}</AgentAvatarCard>);
    expect(html).not.toContain("avatar-card__bar");
  });

  it("with no video allowed (reduced motion, Save-Data) the face stays the poster all through the call", async () => {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} });
    const { bar, host } = await mount(PACK());
    host.callStatus = "connected";
    document.dispatchEvent(new CustomEvent("call-start", { bubbles: true }));
    await settle();
    expect(bar().querySelector("video")).toBeNull();
    expect(bar().dataset.kind).toBe("live");
  });
});

describe("the bar steps aside over the offer card and the footer, when it is not in a call", () => {
  const zoneIO = () => ios.find((i) => i.options?.rootMargin === "-80% 0px 0px 0px")!;
  const enter = (target: Element, on: boolean) => act(async () => zoneIO().cb([{ isIntersecting: on, target } as IntersectionObserverEntry], {} as IntersectionObserver));

  it("watches the offer and the footer in the bottom fifth of the window", async () => {
    await mount(PACK());
    expect(zoneIO().targets.map((t) => (t as HTMLElement).dataset.block)).toEqual(["offer", "footer"]);
  });

  it("sets data-bar-zone while either is there, and clears it when both have left", async () => {
    const { card } = await mount(PACK());
    const [offer, footer] = zoneIO().targets;
    expect(card.dataset.barZone).toBeUndefined();
    await enter(offer, true);
    expect(card.dataset.barZone).toBe("off");
    await enter(footer, true);
    await enter(offer, false);
    expect(card.dataset.barZone).toBe("off"); // the footer is still there
    await enter(footer, false);
    expect(card.dataset.barZone).toBeUndefined();
  });

  it("does not watch at all in a call (the bar is always shown then)", async () => {
    await mount(PACK(), { callStatus: "connecting" });
    await settle();
    expect(ios.filter((i) => i.options?.rootMargin === "-80% 0px 0px 0px").every((i) => i.targets.length === 0)).toBe(true);
  });
});

describe("the stylesheet", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const phone = /@media \(width < 56\.25em\) \{\s*\/\* the compact docked card is not drawn/.exec(css) ? css.slice(css.indexOf("/* the compact docked card is not drawn")) : "";
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]"=()>:*]/g, "\\$&")} \\{([^}]*)\\}`).exec(phone)?.[1] ?? "";

  it("is not drawn outside the phone query (desktop is unchanged)", () => {
    expect(/\.avatar-card__bar \{\s*display: none;\s*\}/.test(css)).toBe(true);
    expect(phone).not.toBe("");
  });

  it("is one pill across the bottom: 0.75rem margins and the safe area, 4.5rem high, radius 99rem, the card's colour tokens, the dark theme's gold edge", () => {
    const body = rule('.avatar-card[data-icon="orb"] .avatar-card__bar');
    expect(body).toMatch(/position: fixed;/);
    expect(body).toMatch(/left: 0\.75rem;\s*right: 0\.75rem;/);
    expect(body).toMatch(/bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom, 0rem\)\);/);
    expect(body).toMatch(/height: 4\.5rem;/);
    expect(body).toMatch(/border-radius: 99rem;/);
    expect(body).toMatch(/background: var\(--avatar-stage, black\);/);
    expect(body).toMatch(/color: var\(--avatar-ink, white\);/);
    expect(body).toMatch(/box-shadow: var\(--avatar-edge, /);
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it("appears as one element (opacity, 200ms), never in parts, and at once under reduced motion", () => {
    expect(rule('.avatar-card[data-icon="orb"] .avatar-card__bar')).toMatch(/opacity: 0;\s*visibility: hidden;\s*pointer-events: none;\s*transition:\s*opacity 200ms ease,\s*visibility 0s 200ms;/);
    expect(css).toMatch(/\.avatar-card\[data-icon="orb"\]\[data-placement="dock"\]:not\(\[data-bar-zone\]\) \.avatar-card__bar,\s*\.avatar-card\[data-icon="orb"\]\[data-placement="dock"\]:not\(\[data-call="idle"\]\) \.avatar-card__bar \{\s*opacity: 1;\s*visibility: visible;/);
    expect(css).toMatch(/@media \(width < 56\.25em\) and \(prefers-reduced-motion: reduce\) \{\s*\.avatar-card\[data-icon="orb"\] \.avatar-card__bar,\s*\.avatar-card__face-video \{\s*transition: none;/);
    // no part of it has a transition of its own that could move it: the button has no separate animation in the bar
    expect(rule(".avatar-card__bar-button")).not.toMatch(/transition|animation|transform|translate/);
  });

  it("exactly one Sofia: every rule that shows the bar needs the docked placement (the full card is out of view), in a call too", () => {
    const shows = [...phone.matchAll(/([^{}]+)\{[^{}]*visibility: visible;[^{}]*\}/g)].filter((m) => /avatar-card__bar/.test(m[1]));
    expect(shows.length).toBeGreaterThan(0);
    for (const m of shows) for (const sel of m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",")) expect(sel, sel.trim()).toContain('[data-placement="dock"]');
    // and the old clause that showed it in every call (over the full card) is gone
    expect(css).not.toMatch(/\.avatar-card\[data-icon="orb"\]:not\(\[data-call="idle"\]\) \.avatar-card__bar/);
  });

  it("the docked card is not drawn on a phone, but its widget stays mounted", () => {
    expect(css).toMatch(/\.avatar-card\[data-icon="orb"\]\[data-placement="dock"\] \{\s*width: 0;\s*height: 0;/);
    expect(css).toMatch(/\.avatar-card\[data-icon="orb"\]\[data-placement="dock"\] \.avatar-card__frame,[\s\S]*?\.call-bubble\[data-placement="dock"\] \{\s*display: none;/);
    expect(css).not.toMatch(/\.avatar-card\[data-icon="orb"\]\[data-placement="dock"\] \.avatar-card__action \{[^}]*display: none/); // the widget's host and its form overlay live there
  });

  it("the face is a 3.5rem round crop on the face; the button is the orb at 3.5rem without its label; text is two lines with an ellipsis", () => {
    expect(rule(".avatar-card__face")).toMatch(/width: 3\.5rem;\s*height: 3\.5rem;[\s\S]*border-radius: 50%;\s*overflow: hidden;/);
    expect(rule(".avatar-card__bar-button")).toMatch(/font-size: calc\(3\.5rem \/ 6\.25\);/);
    expect(css).toMatch(/\.avatar-card__bar-button \.call-orb__label \{\s*display: none;/);
    expect(rule(".avatar-card__bar-line")).toMatch(/text-overflow: ellipsis;\s*white-space: nowrap;/);
    expect(rule(".avatar-card__bar-timer")).toMatch(/flex: none;/);
  });

  it("frames the whole head with air in the circle: the poster and both loops share ONE crop, so nothing jumps on the crossfade", () => {
    const body = /\.avatar-card__face-img,\s*\.avatar-card__face-video \{([^}]*)\}/.exec(phone)?.[1] ?? "";
    expect(body).toMatch(/left: -13%;\s*top: -8%;\s*width: 124%;\s*height: 155%;/); // a 4:5 picture, 1.55 circles high, the face centred, the eyes at 40%
    expect(body).toMatch(/max-width: none;/);
    // the video rule adds only its fade: no other geometry of its own
    const own = [...phone.matchAll(/\n  \.avatar-card__face-video \{([^}]*)\}/g)].map((m) => m[1]).find((b) => /opacity: 0;/.test(b)) ?? "";
    expect(own).toMatch(/opacity: 0;/);
    expect(own).not.toMatch(/left|top|width|height|object-position|inset/);
  });

  it("has no green live dot on the face, in the markup or the stylesheet", () => {
    expect(css).not.toMatch(/face-live/);
  });

  it("leaves room for it under the last line of the page, shown or not", () => {
    expect(css).toMatch(/:root:has\(\.avatar-card\[data-icon="orb"\]\) \{\s*--avatar-card-h: 4\.5rem;\s*--avatar-card-bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom, 0rem\) \+ 0\.75rem\);/);
  });
});
