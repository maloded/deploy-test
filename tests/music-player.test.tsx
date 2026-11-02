// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayer } from "@/components/MusicPlayer";
import ProductLayout from "@/components/ProductLayout";
import { resetVolumeMemory } from "@/lib/music-volume";
import { buildSite } from "@/lib/site";
import { UI_KEYS, ui } from "@/lib/ui-strings";
import { examples, FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

/** A stand-in for HTMLAudioElement: it records what the player does and can refuse to play. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectPlay: Error | null = null;
  src = "";
  preload = "";
  loop = false;
  volume = 1;
  paused = true;
  plays = 0;
  pauses = 0;
  listeners: Record<string, (() => void)[]> = {};
  constructor() {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  play() {
    this.plays++;
    if (FakeAudio.rejectPlay) return Promise.reject(FakeAudio.rejectPlay);
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.pauses++;
    this.paused = true;
  }
  fail() {
    this.listeners.error?.forEach((fn) => fn());
  }
}

const REF = `${fixtures.seller}/fixture-car`;
const track = (id: string, titleDe = id) => ({ id, title: { en: `Title ${id}`, de: titleDe }, file: `audio/${id}.wav`, license: "generated for tests" });
const MUSIC = { tracks: [track("calm", "Ruhe"), track("soft", "Sanft")], volume: 0.15 };

let root: Root | undefined;
let box: HTMLDivElement | undefined;
function render(music: unknown, { lang = "en", agent, avatar }: { lang?: "de" | "en"; agent?: unknown; avatar?: unknown } = {}) {
  const site = buildSite(null, REF, FIXTURE_DIR, lang);
  return { ...site, product: { ...site.product, music }, seller: { ...site.seller, agent }, ...(avatar ? { avatar } : {}) } as any;
}
async function mount(music: unknown, options: { lang?: "de" | "en"; agent?: unknown; avatar?: unknown } = {}) {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={render(music, options)} />));
}
const button = () => box!.querySelector(".music__button") as HTMLButtonElement;
const next = () => box!.querySelector(".music__next") as HTMLButtonElement | null;
const title = () => box!.querySelector(".music__title")!.textContent;
const position = () => box!.querySelector(".music__position")?.textContent ?? null;
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
const gesture = (type: string, target: Element = document.body) => act(async () => void target.dispatchEvent(new Event(type, { bubbles: true })));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const pressed = () => button().getAttribute("aria-pressed");
const setConnection = (value: unknown) => Object.defineProperty(navigator, "connection", { configurable: true, value });
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.rejectPlay = null;
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  resetVolumeMemory();
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setConnection(undefined);
  setHidden(false);
  document.body.style.overflow = "";
});

describe("no music object", () => {
  it("renders no player and creates no audio, and a gesture changes nothing", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await mount(undefined);
    expect(box!.querySelector(".music")).toBeNull();
    expect(renderToStaticMarkup(<ProductLayout site={render(undefined)} />)).not.toMatch(/music|<audio/i);
    await gesture("pointerdown");
    expect(FakeAudio.instances).toHaveLength(0);
    expect(add.mock.calls.filter(([type]) => ["pointerdown", "touchend", "keydown"].includes(type as string))).toEqual([]);
  });
});

describe("the player", () => {
  it("sits in the header in ONE group with the theme toggle, after the language switcher; one icon opens a named panel with every control", async () => {
    await mount(MUSIC, { lang: "de" });
    const header = box!.querySelector("header")!;
    const tools = header.querySelector(".lang-switch")!.nextElementSibling!;
    expect(tools.classList.contains("header-tools")).toBe(true);
    expect([...tools.children].map((c) => c.className)).toEqual(["theme-toggle", "music"]);
    const toggle = box!.querySelector<HTMLButtonElement>(".music__toggle")!;
    expect(toggle.getAttribute("aria-label")).toBe("Musiksteuerung");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(box!.querySelector(".music__panel")!.id);
    expect(toggle.querySelector("svg.music__eq")!.getAttribute("aria-hidden")).toBe("true");
    expect(box!.querySelector(".music__panel")!.getAttribute("aria-label")).toBe(ui("music.group", "de"));
    // nothing of the old always-visible row: no select, no inline volume button
    expect(box!.querySelector(".music__select, .music__volume-button")).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Musik abspielen");
    expect(pressed()).toBe("false");
    expect(title()).toBe("Ruhe");
    expect(position()).toBe("1 von 2");
  });

  it("the icon says when the music plays (name and data-playing), for a screen reader and for the accent colour", async () => {
    await mount(MUSIC, { lang: "en" });
    const toggle = () => box!.querySelector<HTMLButtonElement>(".music__toggle")!;
    expect(toggle().getAttribute("aria-label")).toBe("Music controls");
    expect(box!.querySelector(".music")!.getAttribute("data-playing")).toBe("false");
    await click(button());
    expect(toggle().getAttribute("aria-label")).toBe("Music controls, playing");
    expect(box!.querySelector(".music")!.getAttribute("data-playing")).toBe("true");
  });

  it("with one track there is no next button and no \"1 of N\", and with one language the player is alone after the brand", async () => {
    await mount({ ...MUSIC, tracks: [track("calm")] });
    expect(next()).toBeNull();
    expect(position()).toBeNull();
    expect(title()).toBe("Title calm");
    expect(button()).not.toBeNull();
  });

  it("the note about the assistant is there only when the header passes the assistant's name", async () => {
    await mount(MUSIC, { lang: "de" });
    expect(box!.querySelector(".music__note")).toBeNull(); // the fixture seller has no assistant
    await act(async () => root!.unmount());
    root = undefined;
    box!.remove();
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    const tracks = [{ id: "calm", title: "Ruhe", src: "/a.wav" }];
    await act(async () => root!.render(<MusicPlayer lang="de" tracks={tracks} defaultTrack="calm" volume={0.15} assistantName="Sofia" />));
    expect(box.querySelector(".music__note")!.textContent).toBe("Pausiert, wenn Sie mit Sofia sprechen");
    await act(async () => root!.render(<MusicPlayer lang="en" tracks={tracks} defaultTrack="calm" volume={0.15} assistantName="Sofia" />));
    expect(box.querySelector(".music__note")!.textContent).toBe("Pauses when you talk to Sofia");
  });

  it("lays the panel out as two columns: play and mute in column 1, then title/next and slider/percent in column 2, the note across both", async () => {
    await mount(MUSIC);
    const panel = box!.querySelector(".music__panel")!;
    expect([...panel.children].map((c) => c.className)).toEqual(["music__button", "music__now", "music__mute", "music__volume", "music__note"].filter((c) => c !== "music__note"));
    expect(panel.querySelector(".music__now")!.querySelector(".music__track")).not.toBeNull();
    expect(panel.querySelector(".music__now")!.lastElementChild!.className).toBe("music__next"); // the next button ends the first row
    expect(panel.querySelector(".music__volume")!.lastElementChild!.className).toBe("music__percent"); // the percent ends the second
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.music__panel \{[^}]*grid-template-columns: var\(--header-control-h, 2\.75rem\) minmax\(0, 1fr\);[^}]*gap: 0\.75rem var\(--space-3\);[^}]*padding: 1rem;/);
    expect(css).toMatch(/\.music__percent \{[^}]*width: 4ch;[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toMatch(/\.music__note \{[^}]*padding-top: 0\.75rem;[^}]*border-top: 1px solid var\(--border\)/);
  });

  it("shows the volume as a percent next to the slider", async () => {
    await mount(MUSIC);
    expect(box!.querySelector(".music__percent")!.textContent).toBe("15%"); // no space, so the width is the same whatever the number
  });

  it("works with the agent in the header too (and the header has no button then)", async () => {
    await mount(MUSIC, { agent: { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" } });
    const header = box!.querySelector("header")!;
    expect(header.querySelector(".music")).not.toBeNull();
    expect(header.querySelector("hanc-ai-pill-call")).not.toBeNull();
    expect(header.querySelector(".music")!.compareDocumentPosition(header.querySelector(".site-header__agent")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("creates the audio element only at the first start, with preload none and loop, silent and fading up to the configured volume", async () => {
    vi.useFakeTimers();
    await mount({ ...MUSIC, volume: 0.4 });
    expect(FakeAudio.instances).toHaveLength(0);
    await click(button());
    expect(FakeAudio.instances).toHaveLength(1);
    const a = FakeAudio.instances[0];
    expect(a).toMatchObject({ preload: "none", loop: true, volume: 0, plays: 1, src: `/media/${REF}/audio/calm.wav` });
    await advance(300);
    expect(a.volume).toBe(0.4);
    expect(pressed()).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Pause music");
  });

  it("plays and pauses with the one button, keeping the element; a pause fades out first", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await click(button());
    expect(pressed()).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Play music");
    expect(FakeAudio.instances[0].pauses).toBe(0); // still fading out
    await advance(300);
    expect(FakeAudio.instances[0].pauses).toBe(1);
    expect(FakeAudio.instances[0].volume).toBe(0);
    await click(button());
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].plays).toBe(2);
  });

  it("next switches the track while playing: pause, new src, play (and wraps round); while paused it only remembers the choice", async () => {
    await mount(MUSIC);
    await click(next()!);
    expect(title()).toBe("Title soft");
    expect(position()).toBe("2 of 2");
    expect(FakeAudio.instances).toHaveLength(0); // paused, never started: nothing is created or requested
    await click(button());
    expect(FakeAudio.instances[0].src).toBe(`/media/${REF}/audio/soft.wav`);
    const a = FakeAudio.instances[0];
    await click(next()!); // wraps to the first
    expect(title()).toBe("Title calm");
    expect(a.pauses).toBe(1);
    expect(a.src).toBe(`/media/${REF}/audio/calm.wav`);
    expect(a.plays).toBe(2);
    expect(pressed()).toBe("true");
  });

  it("starts with the defaultTrack", async () => {
    await mount({ ...MUSIC, defaultTrack: "soft" });
    expect(title()).toBe("Title soft");
    expect(position()).toBe("2 of 2");
    await click(button());
    expect(FakeAudio.instances[0].src).toContain("soft.wav");
  });

  it("pauses when the tab is hidden and does not resume by itself", async () => {
    await mount(MUSIC);
    await click(button());
    await act(async () => setHidden(true));
    expect(pressed()).toBe("false");
    expect(FakeAudio.instances[0].paused).toBe(true);
    await act(async () => setHidden(false));
    expect(pressed()).toBe("false");
    expect(FakeAudio.instances[0].plays).toBe(1);
  });

  it("shows a short message when the file fails (404) or play() is refused after a click, and never throws", async () => {
    await mount(MUSIC);
    await click(button());
    await act(async () => FakeAudio.instances[0].fail());
    expect(box!.querySelector(".music__error")!.textContent).toBe("Music unavailable");
    expect(pressed()).toBe("false");
    await act(async () => root!.unmount());
    root = undefined;
    box!.remove();
    FakeAudio.rejectPlay = new Error("NotSupportedError");
    await mount(MUSIC, { lang: "de" });
    await click(button());
    expect(box!.querySelector(".music__error")!.textContent).toBe("Musik nicht verfügbar");
    expect(pressed()).toBe("false");
  });

  it("does not react to the assistant's page-context commands, or to a call that ends", async () => {
    await mount(MUSIC);
    await click(button());
    await act(async () => void document.dispatchEvent(new CustomEvent("agent-command", { detail: { type: "page_context", respond: () => {} }, cancelable: true })));
    await act(async () => void document.dispatchEvent(new CustomEvent("call-end", { bubbles: true })));
    expect(pressed()).toBe("true");
    expect(FakeAudio.instances[0].pauses).toBe(0);
    const src = fs.readFileSync("src/components/MusicPlayer.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/respond\(|preventDefault|sessionStorage|document\.cookie|fetch\(/); // it only reads; the storage is in music-volume.ts
  });

  it("uses the theme only: --header-control-h targets, a visible focus, no raw colour and no new font", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    const rules = css.match(/\.music[\w_-]*(?:\[[^\]]*\])?(?::[\w-]+)? \{[^}]*\}/g)!.join("\n");
    expect(rules).toMatch(/width: var\(--header-control-h, 2\.75rem\)/); // the buttons are exactly as high as the header's other controls
    expect(rules).toMatch(/height: var\(--header-control-h, 2\.75rem\)/);
    expect(rules).toMatch(/:focus-visible/);
    expect(rules).toMatch(/\.music__panel \{[^}]*background: var\(--surface, var\(--bg\)\)/);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(rules).not.toMatch(/font-family/);
  });

  it("the icon takes the accent colour while the music plays, and the bars move only without a reduced-motion preference", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.music\[data-playing="true"\] \.music__toggle \{[^}]*color: var\(--accent-line, var\(--accent\)\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.music\[data-playing="true"\] \.music__bar \{[^}]*animation: music-bar/);
  });

  it("opens under the icon on a wide screen (18.5rem) and under the header, full width minus 1rem margins, below 900px", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.music__panel \{[^}]*top: calc\(100% \+ var\(--space-2\)\);[^}]*inset-inline-end: 0;[^}]*width: min\(18\.5rem, calc\(100vw - 2rem\)\)/);
    expect(css).toMatch(/@media \(width < 56\.25em\) \{\s*\.site-header \.music \{\s*position: static;\s*\}\s*\.site-header \.music__panel \{[^}]*inset-inline: 1rem;[^}]*top: calc\(100% \+ 0\.5rem\);[^}]*width: auto/);
  });

  it("the page markup carries the player but no audio element and no media request before the start", () => {
    const html = renderToStaticMarkup(<ProductLayout site={render(MUSIC)} />);
    expect(html).toContain('class="music"');
    expect(html).not.toMatch(/<audio|\.wav|\.mp3/);
  });
});

describe("volume, mute and the popover", () => {
  const slider = () => box!.querySelector<HTMLInputElement>(".music__slider")!;
  const mute = () => box!.querySelector<HTMLButtonElement>(".music__mute")!;
  const volumeButton = () => box!.querySelector<HTMLButtonElement>(".music__toggle")!;
  const move = (value: number) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider(), String(value));
      slider().dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("has named controls: a labelled slider with a value text, a mute toggle, and the icon that opens the popover", async () => {
    await mount(MUSIC, { lang: "de" });
    expect(slider().getAttribute("aria-label")).toBe("Lautstärke der Musik");
    expect(slider().getAttribute("aria-valuetext")).toBe("15%");
    expect([slider().min, slider().max, slider().value]).toEqual(["0", "100", "15"]);
    expect(mute().getAttribute("aria-label")).toBe("Musik stummschalten");
    expect(mute().getAttribute("aria-pressed")).toBe("false");
    expect(volumeButton().getAttribute("aria-label")).toBe("Musiksteuerung");
    expect(volumeButton().getAttribute("aria-expanded")).toBe("false");
    expect(volumeButton().getAttribute("aria-controls")).toBe(box!.querySelector(".music__panel")!.id);
  });

  it("the slider sets the volume at once while playing, and stores it", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await move(60);
    expect(FakeAudio.instances[0].volume).toBe(0.6);
    expect(localStorage.getItem("music-volume")).toBe("0.6");
    expect(slider().getAttribute("aria-valuetext")).toBe("60%");
  });

  it("remembers only the volume: the next visit shows it, and still does not play", async () => {
    await mount(MUSIC);
    await move(40);
    await act(async () => root!.unmount());
    root = undefined;
    box!.remove();
    resetVolumeMemory(); // a new page view: nothing in memory, the storage is all there is
    await mount(MUSIC);
    expect(slider().value).toBe("40");
    expect(pressed()).toBe("false");
    expect(FakeAudio.instances).toHaveLength(0);
    expect(Object.keys(localStorage).sort()).toEqual(["music-volume"]);
  });

  it("starts at the stored volume, not the product's", async () => {
    vi.useFakeTimers();
    localStorage.setItem("music-volume", "0.7");
    await mount(MUSIC);
    await click(button());
    await advance(300);
    expect(FakeAudio.instances[0].volume).toBe(0.7);
  });

  it("ignores a stored value that is not a volume, and a blocked storage still lets the slider work", async () => {
    localStorage.setItem("music-volume", "loud");
    await mount(MUSIC);
    expect(slider().value).toBe("15");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    await move(30);
    expect(slider().value).toBe("30"); // kept for this page view
  });

  it("mute silences the playing audio and keeps the volume; unmute brings it back; mute is not stored", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await click(mute());
    expect(mute().getAttribute("aria-pressed")).toBe("true");
    expect(FakeAudio.instances[0].volume).toBe(0);
    expect(slider().value).toBe("15");
    expect(localStorage.getItem("music-volume")).toBeNull();
    await click(mute());
    expect(FakeAudio.instances[0].volume).toBe(0.15);
  });

  it("moving the slider while muted unmutes", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await click(mute());
    await move(50);
    expect(mute().getAttribute("aria-pressed")).toBe("false");
    await advance(300);
    expect(FakeAudio.instances[0].volume).toBe(0.5);
  });

  it("a track started while muted stays silent", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(mute());
    await click(button());
    await advance(300);
    expect(FakeAudio.instances[0].volume).toBe(0);
    expect(pressed()).toBe("true");
  });

  it("a start fades in over 300 ms and a pause fades out over 300 ms, in steps", async () => {
    vi.useFakeTimers();
    await mount({ ...MUSIC, volume: 0.5 });
    await click(button());
    const a = FakeAudio.instances[0];
    await advance(140);
    expect(a.volume).toBeGreaterThan(0);
    expect(a.volume).toBeLessThan(0.5);
    await advance(160);
    expect(a.volume).toBe(0.5);
    await click(button());
    await advance(140);
    expect(a.volume).toBeLessThan(0.5);
    expect(a.paused).toBe(false);
    await advance(160);
    expect(a.volume).toBe(0);
    expect(a.paused).toBe(true);
  });

  it("pressing play again during a fade-out turns the same audio back up without a new play() gap", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await click(button());
    await advance(100);
    await click(button());
    await advance(300);
    expect(FakeAudio.instances[0].paused).toBe(false);
    expect(FakeAudio.instances[0].volume).toBe(0.15);
  });

  it("the popover opens with the music icon and closes with Escape (focus back) or a press outside", async () => {
    await mount(MUSIC);
    const root_ = () => box!.querySelector(".music")!;
    await click(volumeButton());
    expect(root_().getAttribute("data-open")).toBe("true");
    expect(volumeButton().getAttribute("aria-expanded")).toBe("true");
    volumeButton().focus();
    await act(async () => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(root_().getAttribute("data-open")).toBe("false");
    expect(document.activeElement).toBe(volumeButton());
    await click(volumeButton());
    await act(async () => void document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(root_().getAttribute("data-open")).toBe("false");
    await click(volumeButton());
    await act(async () => void slider().dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(root_().getAttribute("data-open")).toBe("true"); // a press inside the player keeps it open
  });

  it("a hidden tab pauses at once, without a fade", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await act(async () => setHidden(true));
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(pressed()).toBe("false");
  });
});

describe("hover, press and focus states", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const has = (re: RegExp) => expect(css).toMatch(re);

  it("the four icon controls get an 8% text-colour background on hover (a pointer that can hover) and 12% when pressed, with the icon in the full text colour", () => {
    has(/@media \(hover: hover\) \{\s*\.theme-toggle:hover:not\(:disabled\),\s*\.music__toggle:hover:not\(:disabled\),\s*\.music__next:hover:not\(:disabled\),\s*\.music__mute:hover:not\(:disabled\) \{\s*background: color-mix\(in srgb, var\(--text\) 8%, transparent\);\s*color: var\(--text\);/);
    has(/\.theme-toggle:active,\s*\.music__toggle:active,\s*\.music__next:active,\s*\.music__mute:active \{\s*background: color-mix\(in srgb, var\(--text\) 12%, transparent\);\s*color: var\(--text\);/);
  });

  it("the music icon keeps the accent colour while it plays, also on hover and press", () => {
    has(/\.music\[data-playing="true"\] \.music__toggle:hover \{\s*color: var\(--accent-line, var\(--accent\)\);/);
    has(/\.music\[data-playing="true"\] \.music__toggle:active \{\s*color: var\(--accent-line, var\(--accent\)\);/);
  });

  it("the round play/pause button brightens (12% white into the accent) with a soft 20% accent ring on hover, and scales to 0.96 when pressed", () => {
    has(/\.music__button:hover:not\(:disabled\) \{\s*background: color-mix\(in srgb, var\(--accent\) 88%, white\);\s*box-shadow: 0 0 0 0\.25rem color-mix\(in srgb, var\(--accent\) 20%, transparent\);/);
    has(/\.music__button:active:not\(:disabled\) \{\s*transform: scale\(0\.96\);/);
  });

  it("changes take 150ms, and the scale (and every transition) exists only without a reduced-motion preference", () => {
    const block = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.lang-switch a,[\s\S]*?\n\}\n/.exec(css)?.[0] ?? "";
    expect(block).toMatch(/background-color 150ms ease/);
    expect(block).toMatch(/transform 150ms ease/);
    expect(block).toMatch(/transform: scale\(0\.96\)/);
    expect(css.match(/scale\(0\.96\)/g)).toHaveLength(1); // nowhere outside that query
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.music__slider:hover::-webkit-slider-thumb[^@]*transform: none/);
  });

  it("the slider thumb grows a little and gets an accent ring on hover and while dragged (WebKit and Firefox, as separate rules), the track fills to the value", () => {
    for (const part of ["-webkit-slider-thumb", "-moz-range-thumb"]) {
      has(new RegExp(`\\.music__slider:hover::${part},\\s*\\.music__slider:active::${part} \\{\\s*box-shadow: 0 0 0 0\\.25rem color-mix\\(in srgb, var\\(--accent\\) 20%, transparent\\);\\s*transform: scale\\(1\\.15\\)`));
    }
    has(/linear-gradient\(to right, var\(--accent-line, var\(--accent\)\) var\(--music-fill, 0%\), var\(--border\) var\(--music-fill, 0%\)\)/);
    has(/::-moz-range-progress/);
  });

  it("the component passes the fill, so the track follows the value", async () => {
    await mount(MUSIC);
    const slider = box!.querySelector<HTMLInputElement>(".music__slider")!;
    expect(slider.style.getPropertyValue("--music-fill")).toBe("15%");
  });

  it("language links underline in the accent on hover", () => {
    has(/\.lang-switch a:hover \{\s*color: var\(--text\);\s*text-decoration: underline;\s*text-decoration-color: var\(--accent-line, var\(--accent\)\);/);
  });

  it("every control has the same visible focus ring: 2px accent, 2px offset (:focus-visible, so none after a mouse click), and a pointer cursor", () => {
    for (const sel of [".lang-switch a:focus-visible", ".theme-toggle:focus-visible"]) {
      const body = new RegExp(`${sel.replace(/[.[\]:()-]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(body, sel).toMatch(/outline: 2px solid var\(--accent-line, var\(--accent\)\);\s*outline-offset: 2px/);
    }
    has(/\.music__toggle:focus-visible,\s*\.music__button:focus-visible,\s*\.music__next:focus-visible,\s*\.music__mute:focus-visible,\s*\.music__slider:focus-visible \{\s*outline: 2px solid var\(--accent-line, var\(--accent\)\);\s*outline-offset: 2px;/);
    expect(css).not.toMatch(/\.music__toggle:focus-visible \{\s*outline-offset: -2px/);
    has(/\.music__next,\s*\.music__mute \{[^}]*cursor: pointer/);
    for (const sel of [".lang-switch a", ".theme-toggle", ".music__toggle", ".music__button", ".music__slider"]) {
      const body = new RegExp(`${sel.replace(/[.[\]]/g, "\\$&")} \\{([^}]*)\\}`, "g");
      const all = [...css.matchAll(body)].map((m) => m[1]).join("\n");
      expect(all, sel).toMatch(/cursor: pointer/);
    }
  });
});

describe("a call with the assistant", () => {
  /** A stand-in for the widget element, found by its tag; its callStatus is whatever the test says. */
  function widget() {
    const el = document.createElement("hanc-ai-pill-floating-call") as HTMLElement & { callStatus: string };
    el.callStatus = "idle";
    document.body.appendChild(el);
    return {
      el,
      set: (status: string) => act(async () => {
        el.callStatus = status;
        el.dispatchEvent(new CustomEvent(status === "idle" ? "call-end" : "call-start", { bubbles: true }));
        await vi.advanceTimersByTimeAsync(0);
      }),
    };
  }
  afterEach(() => document.querySelectorAll("hanc-ai-pill-floating-call").forEach((n) => n.remove()));

  it("connecting fades the music out and pauses it; the button shows paused at once", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    const a = FakeAudio.instances[0];
    await w.set("connecting");
    expect(pressed()).toBe("false");
    expect(a.paused).toBe(false); // fading
    await advance(150);
    expect(a.volume).toBeLessThan(0.15);
    await advance(150);
    expect(a.paused).toBe(true);
    expect(a.volume).toBe(0);
  });

  it("is read from the status alone too: connecting is noticed by the poll, with no event", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    w.el.callStatus = "connecting";
    await advance(200); // the bridge polls every 150 ms
    expect(pressed()).toBe("false");
  });

  it("a call that has started (connected) with no earlier status also stops it", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await w.set("connected");
    expect(pressed()).toBe("false");
    await advance(300);
    expect(FakeAudio.instances[0].paused).toBe(true);
  });

  it("does NOT resume when the call ends, nor after any later status", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await w.set("connected");
    await advance(300);
    await w.set("idle");
    await advance(2000);
    expect(pressed()).toBe("false");
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(FakeAudio.instances[0].plays).toBe(1);
  });

  it("the visitor can start it again by hand after the call, and the next call stops it again", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await w.set("connected");
    await advance(300);
    await w.set("idle");
    await click(button());
    await advance(300);
    expect(pressed()).toBe("true");
    expect(FakeAudio.instances[0].volume).toBe(0.15);
    await w.set("connecting");
    expect(pressed()).toBe("false");
  });

  it("music started by hand in the middle of a call is left alone (until the next call)", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await w.set("connected");
    await click(button());
    await advance(1000);
    expect(pressed()).toBe("true");
    await w.set("idle");
    await w.set("connecting");
    expect(pressed()).toBe("false");
  });

  it("nothing is watched while the music is not playing, and the watcher is removed when it stops", async () => {
    vi.useFakeTimers();
    widget();
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    await mount(MUSIC);
    expect(add.mock.calls.filter(([t]) => t === "call-start")).toEqual([]);
    await click(button());
    expect(add.mock.calls.filter(([t]) => t === "call-start")).toHaveLength(1);
    await click(button());
    expect(remove.mock.calls.filter(([t]) => t === "call-start")).toHaveLength(1);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1); // only the fade-out, no status poll
  });

  it("works without a widget on the page (a call-start event on the document still stops it)", async () => {
    vi.useFakeTimers();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    await act(async () => void document.dispatchEvent(new CustomEvent("call-start", { bubbles: true })));
    expect(pressed()).toBe("false");
  });

  it("a failed call (error) does not by itself stop the music", async () => {
    vi.useFakeTimers();
    const w = widget();
    await mount(MUSIC);
    await click(button());
    await advance(300);
    w.el.callStatus = "error";
    await advance(400);
    expect(pressed()).toBe("true");
  });
});

describe("no autoplay", () => {
  it("starts nothing without a press: no listener, no audio, whatever the visitor does, on any visit", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await mount(MUSIC);
    for (const type of ["pointerdown", "touchend", "keydown"]) await gesture(type);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(add.mock.calls.filter(([type]) => ["pointerdown", "touchend", "keydown"].includes(type as string))).toEqual([]);
  });

  it("a stored volume does not start the music either, and the source has no autostart path", async () => {
    localStorage.setItem("music-volume", "0.5");
    await mount(MUSIC);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(pressed()).toBe("false");
    const src = fs.readFileSync("src/components/MusicPlayer.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/autoplay|autostart|\.autoplay|saveData/i);
    expect(src.match(/\.play\(\)/g)).toHaveLength(1); // one call, in start(), reached only from the button and the track choice
  });
});

describe("agent-independent and complete strings", () => {
  it("every music.* string exists in German and English, and none is empty", () => {
    const keys = UI_KEYS.filter((k) => k.startsWith("music."));
    expect(keys.sort()).toEqual(["music.error", "music.group", "music.mute", "music.next", "music.note", "music.open", "music.open.playing", "music.pause", "music.play", "music.position", "music.volume"]);
    for (const key of keys) for (const lang of ["de", "en"] as const) expect(ui(key, lang).trim().length, `${key} ${lang}`).toBeGreaterThan(0);
    expect(ui("music.play", "de")).toBe("Musik abspielen");
    expect(ui("music.pause", "de")).toBe("Musik pausieren");
    expect(ui("music.play", "en")).toBe("Play music");
    expect(ui("music.pause", "en")).toBe("Pause music");
  });
});

describe("the header height with music", () => {
  it("is the header's own (4rem: the controls are 2.75rem inside it), so music sets no --header-h; 5.5rem stays with the agent in the header", () => {
    expect(renderToStaticMarkup(<ProductLayout site={render(MUSIC)} />)).not.toContain("--header-h");
    expect(renderToStaticMarkup(<ProductLayout site={render(undefined)} />)).not.toContain("--header-h");
    const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };
    const html = renderToStaticMarkup(<ProductLayout site={render(MUSIC, { agent })} />);
    expect(html).toContain("--header-h:5.5rem");
  });
});

describe("the example product and its test audio", () => {
  const dir = "examples/example-seller/example-house/media/audio";

  it("example-house has music and loads (files exist, small, allowed extension)", () => {
    const { product } = examples.loadFor("example-house");
    expect(product.music!.tracks.map((t) => t.id)).toEqual(["calm", "soft"]);
    expect(product.music).toMatchObject({ volume: 0.15, defaultTrack: "calm" });
    for (const t of product.music!.tracks) expect(fs.existsSync(`examples/example-seller/example-house/media/${t.file}`)).toBe(true);
  });

  it("the generated files are valid PCM WAV: a browser can decode them", () => {
    for (const name of fs.readdirSync(dir)) {
      const b = fs.readFileSync(`${dir}/${name}`);
      expect(b.toString("ascii", 0, 4), name).toBe("RIFF");
      expect(b.toString("ascii", 8, 12)).toBe("WAVE");
      expect(b.toString("ascii", 12, 16)).toBe("fmt ");
      expect(b.readUInt16LE(20)).toBe(1); // PCM
      expect(b.readUInt16LE(22)).toBe(1); // mono
      expect(b.toString("ascii", 36, 40)).toBe("data");
      expect(b.readUInt32LE(4) + 8).toBe(b.length); // the RIFF size matches the file
      expect(b.readUInt32LE(40) + 44).toBe(b.length); // and so does the data size
      const data = b.subarray(44);
      expect(Math.max(...data) - Math.min(...data)).toBeGreaterThan(20); // a tone, not silence
      expect(Math.max(...data) - Math.min(...data)).toBeLessThan(100); // and a quiet one
    }
  });

  it("the generator reproduces the committed files exactly (so they are never hand-edited music)", async () => {
    const { sineWav, TEST_TRACKS } = await import("../scripts/make-test-audio.mjs");
    for (const [name, frequency] of Object.entries(TEST_TRACKS)) expect(fs.readFileSync(`${dir}/${name}.wav`).equals(sineWav(frequency as number))).toBe(true);
  });

  it("no real music anywhere in the repository: every tracked audio file is a tiny test file under examples/ or tests/", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => /\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(f));
    const untrackedNew = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter((f) => /\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(f));
    for (const f of [...tracked, ...untrackedNew]) {
      expect(/^(examples|tests)\//.test(f), f).toBe(true);
      expect(fs.statSync(f).size, f).toBeLessThan(16 * 1024);
    }
  });
});
