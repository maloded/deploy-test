// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
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
const MUSIC = { tracks: [track("calm", "Ruhe"), track("soft", "Sanft")], volume: 0.15, autostart: "button" as const };

let root: Root | undefined;
let box: HTMLDivElement | undefined;
function render(music: unknown, { lang = "en", agent }: { lang?: "de" | "en"; agent?: unknown } = {}) {
  const site = buildSite(null, REF, FIXTURE_DIR, lang);
  return { ...site, product: { ...site.product, music }, seller: { ...site.seller, agent } } as any;
}
async function mount(music: unknown, options: { lang?: "de" | "en"; agent?: unknown } = {}) {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(<ProductLayout site={render(music, options)} />));
}
const button = () => box!.querySelector(".music__button") as HTMLButtonElement;
const select = () => box!.querySelector(".music__select") as HTMLSelectElement;
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
const gesture = (type: string, target: Element = document.body) => act(async () => void target.dispatchEvent(new Event(type, { bubbles: true })));
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
  it("sits in the header right after the language switcher, with named controls and a track select in the page language", async () => {
    await mount(MUSIC, { lang: "de" });
    const header = box!.querySelector("header")!;
    const switcher = header.querySelector(".lang-switch")!;
    expect(switcher.nextElementSibling?.classList.contains("music")).toBe(true);
    expect(button().getAttribute("aria-label")).toBe("Musik abspielen");
    expect(pressed()).toBe("false");
    expect([...select().options].map((o) => o.textContent)).toEqual(["Ruhe", "Sanft"]);
    expect(select().value).toBe("calm");
    expect(box!.querySelector(".music")!.getAttribute("aria-label")).toBe(ui("music.group", "de"));
  });

  it("with one track there is no select, and with one language the player is alone after the brand", async () => {
    await mount({ ...MUSIC, tracks: [track("calm")] });
    expect(select()).toBeNull();
    expect(button()).not.toBeNull();
  });

  it("works with the agent in the header too (and the header has no button then)", async () => {
    await mount(MUSIC, { agent: { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" } });
    const header = box!.querySelector("header")!;
    expect(header.querySelector(".music")).not.toBeNull();
    expect(header.querySelector("hanc-ai-pill-call")).not.toBeNull();
    expect(header.querySelector(".music")!.compareDocumentPosition(header.querySelector(".site-header__agent")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("creates the audio element only at the first start, with preload none, loop and the configured volume", async () => {
    await mount({ ...MUSIC, volume: 0.4 });
    expect(FakeAudio.instances).toHaveLength(0);
    await click(button());
    expect(FakeAudio.instances).toHaveLength(1);
    const a = FakeAudio.instances[0];
    expect(a).toMatchObject({ preload: "none", loop: true, volume: 0.4, plays: 1, src: `/media/${REF}/audio/calm.wav` });
    expect(pressed()).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Pause music");
  });

  it("plays and pauses with the one button, keeping the element", async () => {
    await mount(MUSIC);
    await click(button());
    await click(button());
    expect(pressed()).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Play music");
    expect(FakeAudio.instances[0].pauses).toBe(1);
    await click(button());
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].plays).toBe(2);
  });

  it("switches the track while playing: pause, new src, play; while paused it only remembers the choice", async () => {
    await mount(MUSIC);
    const choose = (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(), value);
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await choose("soft"); // paused, never started: nothing is created or requested
    expect(FakeAudio.instances).toHaveLength(0);
    await click(button());
    expect(FakeAudio.instances[0].src).toBe(`/media/${REF}/audio/soft.wav`);
    const a = FakeAudio.instances[0];
    await choose("calm");
    expect(a.pauses).toBe(1);
    expect(a.src).toBe(`/media/${REF}/audio/calm.wav`);
    expect(a.plays).toBe(2);
    expect(pressed()).toBe("true");
  });

  it("starts with the defaultTrack", async () => {
    await mount({ ...MUSIC, defaultTrack: "soft" });
    expect(select().value).toBe("soft");
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

  it("is independent of the voice assistant: no widget listener and no reaction to its events", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await mount(MUSIC);
    expect(add.mock.calls.filter(([type]) => type === "agent-command")).toEqual([]);
    await click(button());
    await act(async () => void document.dispatchEvent(new CustomEvent("agent-command", { detail: { type: "page_context", respond: () => {} }, cancelable: true })));
    for (const type of ["call-start", "call-end"]) await act(async () => void document.dispatchEvent(new CustomEvent(type, { bubbles: true })));
    expect(pressed()).toBe("true");
    expect(FakeAudio.instances[0].pauses).toBe(0);
    expect(FakeAudio.instances[0].volume).toBe(0.15);
    const src = fs.readFileSync("src/components/MusicPlayer.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/agent|hanc|localStorage|sessionStorage|document\.cookie|fetch\(/i);
  });

  it("uses the theme only: --header-control-h targets, a visible focus, no raw colour and no new font", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    const rules = css.match(/\.music[\w_-]*(?:\[[^\]]*\])?(?::[\w-]+)? \{[^}]*\}/g)!.join("\n");
    expect(rules).toMatch(/width: var\(--header-control-h, 2\.25rem\)/); // the button and the select are exactly as high as the header's other controls
    expect(rules).toMatch(/height: var\(--header-control-h, 2\.25rem\)/);
    expect(rules).not.toMatch(/music__pick/); // the visible select, not an icon-only picker
    expect(rules).toMatch(/:focus-visible/);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(rules).not.toMatch(/font-family/);
  });

  it("the page markup carries the player but no audio element and no media request before the start", () => {
    const html = renderToStaticMarkup(<ProductLayout site={render(MUSIC)} />);
    expect(html).toContain('class="music"');
    expect(html).not.toMatch(/<audio|\.wav|\.mp3/);
  });
});

describe('autostart "button"', () => {
  it("starts nothing without a press: no listener, no audio, whatever the visitor does", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await mount({ ...MUSIC, autostart: "button" });
    for (const type of ["pointerdown", "touchend", "keydown"]) await gesture(type);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(add.mock.calls.filter(([type]) => ["pointerdown", "touchend", "keydown"].includes(type as string))).toEqual([]);
  });
});

describe('autostart "gesture"', () => {
  const GESTURE = { ...MUSIC, autostart: "gesture" as const };

  it.each(["pointerdown", "touchend", "keydown"])("starts inside the first %s", async (type) => {
    await mount(GESTURE);
    expect(FakeAudio.instances).toHaveLength(0); // nothing before the gesture
    await gesture(type);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].plays).toBe(1);
    expect(pressed()).toBe("true");
  });

  it("registers one passive handler for the three gestures and removes it at the first one", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    await mount(GESTURE);
    const own = add.mock.calls.filter(([type]) => ["pointerdown", "touchend", "keydown"].includes(type as string));
    expect(own.map(([type]) => type).sort()).toEqual(["keydown", "pointerdown", "touchend"]);
    expect(new Set(own.map(([, fn]) => fn)).size).toBe(1); // the same single handler
    expect(own.every(([, , options]) => (options as any)?.passive === true)).toBe(true);
    await gesture("pointerdown");
    const gone = remove.mock.calls.filter(([type]) => ["pointerdown", "touchend", "keydown"].includes(type as string));
    expect(gone.map(([type]) => type).sort()).toEqual(["keydown", "pointerdown", "touchend"]);
    expect(gone.every(([, fn]) => fn === own[0][1])).toBe(true);
    await gesture("keydown");
    await gesture("touchend");
    expect(FakeAudio.instances[0].plays).toBe(1); // no second start
  });

  it("a pause by the visitor prevents every later automatic start", async () => {
    await mount(GESTURE);
    await gesture("pointerdown");
    await click(button()); // pause
    expect(pressed()).toBe("false");
    for (const type of ["pointerdown", "touchend", "keydown"]) await gesture(type);
    expect(FakeAudio.instances[0].plays).toBe(1);
    expect(pressed()).toBe("false");
  });

  it("a gesture on the player's own button is left to the button: one start, no double toggle", async () => {
    await mount(GESTURE);
    await gesture("pointerdown", button());
    expect(FakeAudio.instances).toHaveLength(0);
    await click(button());
    expect(FakeAudio.instances[0].plays).toBe(1);
    expect(pressed()).toBe("true");
    await gesture("keydown"); // the handler is gone
    expect(FakeAudio.instances[0].plays).toBe(1);
  });

  it("a rejected play() leaves the paused state, with no retry loop and no message", async () => {
    FakeAudio.rejectPlay = Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
    await mount(GESTURE);
    await gesture("pointerdown");
    await act(async () => void (await Promise.resolve()));
    expect(pressed()).toBe("false");
    expect(box!.querySelector(".music__error")).toBeNull();
    for (const type of ["pointerdown", "touchend", "keydown"]) await gesture(type);
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(FakeAudio.instances[0].plays).toBe(1);
    FakeAudio.rejectPlay = null;
    await click(button()); // the visitor can still start it by hand
    expect(pressed()).toBe("true");
  });

  it("does not start with the data saver on, and registers no listener", async () => {
    setConnection({ saveData: true });
    const add = vi.spyOn(document, "addEventListener");
    await mount(GESTURE);
    expect(add.mock.calls.filter(([type]) => ["pointerdown", "touchend", "keydown"].includes(type as string))).toEqual([]);
    await gesture("pointerdown");
    expect(FakeAudio.instances).toHaveLength(0);
    await click(button()); // by hand it still works
    expect(FakeAudio.instances[0].plays).toBe(1);
  });
});

describe("agent-independent and complete strings", () => {
  it("every music.* string exists in German and English, and none is empty", () => {
    const keys = UI_KEYS.filter((k) => k.startsWith("music."));
    expect(keys.sort()).toEqual(["music.error", "music.group", "music.pause", "music.play", "music.track"]);
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
    expect(product.music).toMatchObject({ volume: 0.15, autostart: "button", defaultTrack: "calm" });
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
