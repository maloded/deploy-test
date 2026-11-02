// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import { ThemeToggle } from "@/components/ThemeToggle";
import { applyThemeMode, loadThemeStylesheet } from "@/lib/theme-apply";
import { THEME_PAIR, THEME_STORAGE_KEY } from "@/lib/theme-pref";
import { buildSite } from "@/lib/site";
import { UI_KEYS } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const pair = { ...THEME_PAIR };
const REF = `${fixtures.seller}/fixture-car`;
const html = document.documentElement;

/** happy-dom does not fetch stylesheets: a link appended to the head loads (or fails) when the test says so. */
function stylesheets() {
  return [...document.head.querySelectorAll<HTMLLinkElement>("link[data-theme-css]")];
}
// happy-dom answers a stylesheet link at once (with an error, as it has no network): its events are dropped, and the test sends its own
const realDispatch = HTMLLinkElement.prototype.dispatchEvent;
let manual = false;
const finish = (link: HTMLLinkElement, type: "load" | "error" = "load") => {
  if (type === "load") Object.defineProperty(link, "sheet", { configurable: true, value: {} });
  manual = true;
  try {
    realDispatch.call(link, new Event(type));
  } finally {
    manual = false;
  }
};
const serverLink = () => {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.setAttribute("data-theme-css", "light-editorial");
  Object.defineProperty(l, "sheet", { configurable: true, value: {} });
  document.head.appendChild(l);
  return l;
};
const flush = () => act(async () => {});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // happy-dom reports that it cannot fetch the stylesheet
  vi.spyOn(HTMLLinkElement.prototype, "dispatchEvent").mockImplementation(function (this: HTMLLinkElement, e: Event) {
    return manual ? realDispatch.call(this, e) : true;
  });
  html.setAttribute("data-theme", "light-editorial");
  localStorage.clear();
  serverLink();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.head.querySelectorAll("link[data-theme-css], meta[name=theme-color]").forEach((n) => n.remove());
  html.removeAttribute("data-theme");
});

describe("loadThemeStylesheet", () => {
  it("is immediate for a stylesheet that is already loaded and adds nothing", async () => {
    await loadThemeStylesheet(document, "light-editorial");
    expect(stylesheets()).toHaveLength(1);
  });
  it("adds the link only when asked, and resolves when it loads", async () => {
    const done = vi.fn();
    const p = loadThemeStylesheet(document, "dark-premium").then(done);
    const link = stylesheets().find((l) => l.getAttribute("data-theme-css") === "dark-premium")!;
    expect(link.getAttribute("href")).toBe("/themes/dark-premium.css");
    expect(done).not.toHaveBeenCalled();
    finish(link);
    await p;
    expect(done).toHaveBeenCalled();
  });
  it("rejects and removes the dead link when the fetch fails, so a later click can try again", async () => {
    const p = loadThemeStylesheet(document, "dark-premium");
    finish(stylesheets()[1], "error");
    await expect(p).rejects.toThrow(/could not be loaded/);
    expect(stylesheets()).toHaveLength(1);
  });
  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const p = loadThemeStylesheet(document, "dark-premium", 50);
      const caught = expect(p).rejects.toThrow(/too long/);
      await vi.advanceTimersByTimeAsync(60);
      await caught;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("applyThemeMode", () => {
  it("loads first, then flips data-theme and stores the mode; nothing changes while it loads", async () => {
    const p = applyThemeMode(document, localStorage, pair, "dark");
    expect(html.getAttribute("data-theme")).toBe("light-editorial");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    finish(stylesheets()[1]);
    await p;
    expect(html.getAttribute("data-theme")).toBe("dark-premium");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
  it("a failed load changes and stores nothing", async () => {
    const p = applyThemeMode(document, localStorage, pair, "dark");
    finish(stylesheets()[1], "error");
    await expect(p).rejects.toThrow();
    expect(html.getAttribute("data-theme")).toBe("light-editorial");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
  it("keeps working when the storage is blocked", async () => {
    const blocked = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    const p = applyThemeMode(document, blocked, pair, "dark");
    finish(stylesheets()[1]);
    await expect(p).resolves.toBeUndefined();
    expect(html.getAttribute("data-theme")).toBe("dark-premium");
  });
  it("moves the browser's theme-color to the new --bg when the page has that tag", async () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#fff";
    document.head.appendChild(meta);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: () => " #0b1020 " } as any);
    const p = applyThemeMode(document, localStorage, pair, "dark");
    finish(stylesheets()[1]);
    await p;
    expect(meta.content).toBe("#0b1020");
  });
});

describe("the toggle button", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  const mount = async (theme = "light-editorial") => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<ThemeToggle lang="en" theme={theme} pair={pair} />));
  };
  const btn = () => box!.querySelector("button")!;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
  });

  it("is a button with a fixed label and the state in aria-pressed (off in the light theme)", async () => {
    await mount();
    expect(btn().type).toBe("button");
    expect(btn().getAttribute("aria-label")).toBe("Dark theme");
    expect(btn().getAttribute("aria-pressed")).toBe("false");
    expect(btn().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("follows the page: pressed when data-theme is already dark (the head script ran), without a click", async () => {
    html.setAttribute("data-theme", "dark-premium");
    await mount();
    expect(btn().getAttribute("aria-pressed")).toBe("true");
  });
  it("a click loads the dark stylesheet, then presses the button and stores the choice; a second click goes back with no new fetch", async () => {
    await mount();
    await act(async () => void btn().click());
    expect(stylesheets()).toHaveLength(2);
    expect(btn().getAttribute("aria-pressed")).toBe("false"); // not yet: the stylesheet is on its way
    await act(async () => finish(stylesheets()[1]));
    expect(btn().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await act(async () => void btn().click());
    await flush();
    expect(btn().getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(stylesheets()).toHaveLength(2);
  });
  it("a second click while the stylesheet is still loading adds no second request", async () => {
    await mount();
    await act(async () => void btn().click());
    await act(async () => void btn().click());
    expect(stylesheets()).toHaveLength(2);
  });
  it("is operated with the keyboard like any button (Enter and Space are the browser's click)", async () => {
    await mount();
    btn().focus();
    expect(document.activeElement).toBe(btn());
    expect(btn().tabIndex).toBeGreaterThanOrEqual(0);
  });
  it("a failed stylesheet leaves it unpressed and the next click can try again", async () => {
    await mount();
    await act(async () => void btn().click());
    await act(async () => finish(stylesheets()[1], "error"));
    expect(btn().getAttribute("aria-pressed")).toBe("false");
    await act(async () => void btn().click());
    expect(stylesheets()).toHaveLength(2);
  });
});

describe("in the header", () => {
  const site = (over: Record<string, unknown> = {}) => ({ ...buildSite(null, REF, FIXTURE_DIR, "en"), ...over }) as any;
  it("is rendered for a product whose theme has a counterpart and both stylesheets exist", () => {
    const out = renderToStaticMarkup(<Header site={site({ theme: "light-editorial", availableThemes: ["dark-premium", "light-editorial"] })} />);
    expect(out).toContain('class="theme-toggle"');
    expect(out).toContain('aria-label="Dark theme"');
  });
  it("is not rendered for a custom theme or when the other stylesheet is missing", () => {
    for (const over of [{ theme: "custom", availableThemes: ["custom", "light-editorial", "dark-premium"] }, { theme: "light-editorial", availableThemes: ["light-editorial"] }]) {
      expect(renderToStaticMarkup(<Header site={site(over)} />)).not.toContain("theme-toggle");
    }
  });
  it("has a label in both languages", () => {
    expect(UI_KEYS).toContain("theme.toggle");
  });
});

describe("the stylesheet", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const rule = (sel: string) => new RegExp(`^${sel.replace(/[.[\]"=()>]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
  it("is a full control high (2.75rem, 44px at the default size), with no border or background of its own", () => {
    expect(rule(".theme-toggle")).toMatch(/width: var\(--header-control-h, 2\.75rem\)/);
    expect(rule(".theme-toggle")).toMatch(/[^-]height: var\(--header-control-h, 2\.75rem\)/);
    expect(rule(".theme-toggle")).toMatch(/border: 0/);
    expect(rule(".theme-toggle")).toMatch(/background: transparent/);
  });
  it("sits in ONE group with a 1px border (a ring), radius 0.75rem, with a 1px divider between the two buttons", () => {
    expect(rule(".header-tools")).toMatch(/box-shadow: 0 0 0 1px var\(--border\)/); // a ring: the group stays exactly one control high
    expect(rule(".header-tools")).toMatch(/border-radius: 0\.75rem/);
    expect(css).toMatch(/\.header-tools > \* \+ \* \{\s*border-inline-start: 1px solid var\(--border\);/);
  });
  it("has a focus ring with theme tokens only", () => {
    expect(rule(".theme-toggle:focus-visible")).toMatch(/outline: 2px solid var\(--accent-line, var\(--accent\)\)/);
  });
});

describe("the header group", () => {
  const site = (over: Record<string, unknown> = {}) => ({ ...buildSite(null, REF, FIXTURE_DIR, "en"), ...over }) as any;
  const music = { tracks: [{ id: "a", title: { en: "A", de: "A" }, file: "audio/a.wav", license: "x" }], volume: 0.15 };
  const themes = { theme: "light-editorial", availableThemes: ["dark-premium", "light-editorial"] };
  it("holds the theme toggle and the music icon in ONE group, in that order", () => {
    const s = site({ ...themes, product: { ...site().product, music } });
    const out = renderToStaticMarkup(<Header site={s} />);
    expect(out).toMatch(/<div class="header-tools"><button type="button" class="theme-toggle"[\s\S]*?<\/button><div class="music"/);
    expect(out.match(/header-tools/g)).toHaveLength(1);
  });
  it("is not rendered when there is neither a theme counterpart nor music", () => {
    expect(renderToStaticMarkup(<Header site={site({ theme: "custom", availableThemes: ["custom"] })} />)).not.toContain("header-tools");
  });
  it("with only one of them the group holds that one", () => {
    const only = renderToStaticMarkup(<Header site={site(themes)} />);
    expect(only).toContain("header-tools");
    expect(only).not.toContain('class="music"');
  });
});
