// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import { avatarFiles, avatarManifestSchema, darkLoopFiles, MAX_AVATAR_POSTER_BYTES, resolveAvatar, type ResolvedAvatar } from "@/lib/avatar-manifest";
import { readAvatar } from "@/lib/avatar-library";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const base = { schema: 1, id: "pack-d", name: "Pack D", poster: "poster.webp", license: "Synthetic", provenance: "Generated for the tests", invite: { mp4: "invite.mp4", webm: "invite.webm", cue: { show: 0.5, hide: 2 } }, listen: { mp4: "listen.mp4", webm: "listen.webm" }, speak: "speak.mp4" };
const dark = { poster: "poster.dark.webp", invite: { mp4: "invite.dark.mp4", webm: "invite.dark.webm" }, listen: { mp4: "listen.dark.mp4", webm: "listen.dark.webm" }, speak: "speak.dark.mp4" };
const parse = (m: object) => avatarManifestSchema.safeParse(m);

describe("the pack's dark variants (avatar.json \"dark\")", () => {
  it("is optional, and a pack without it is unchanged", () => {
    expect(parse(base).success).toBe(true);
    const r = resolveAvatar(parse(base).data!);
    expect(r.dark).toBeNull();
  });

  it("takes a poster and any of the four loops, in the same forms as the originals", () => {
    const m = parse({ ...base, dark }).data!;
    expect(darkLoopFiles(m, "invite")).toEqual({ mp4: "invite.dark.mp4", webm: "invite.dark.webm" });
    expect(darkLoopFiles(m, "speak")).toEqual({ mp4: "speak.dark.mp4" });
    expect(darkLoopFiles(m, "listen")).toEqual({ mp4: "listen.dark.mp4", webm: "listen.dark.webm" });
    expect(darkLoopFiles(parse(base).data!, "listen")).toBeNull();
    expect(parse({ ...base, dark: { poster: "poster.dark.webp" } }).success).toBe(true); // a part is enough
  });

  it("is strict: an unknown key, a cue (the original's applies), a wrong extension or a path is refused", () => {
    expect(parse({ ...base, dark: { ...dark, extra: 1 } }).success).toBe(false);
    expect(parse({ ...base, dark: { invite: { mp4: "i.mp4", cue: { show: 1, hide: 2 } } } }).success).toBe(false);
    expect(parse({ ...base, dark: { poster: "poster.dark.png" } }).success).toBe(false);
    expect(parse({ ...base, dark: { listen: "../listen.mp4" } }).success).toBe(false);
    expect(parse({ ...base, dark: { speak: { ogv: "s.ogv" } } }).success).toBe(false);
  });

  it("a dark loop needs the original loop it recolours", () => {
    const { speak: _speak, ...noSpeak } = base;
    void _speak;
    const r = parse({ ...noSpeak, dark: { speak: "speak.dark.mp4" } });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('the pack has no \\"speak\\" loop to recolour');
  });

  it("its files travel with the pack: they are in avatarFiles, once each", () => {
    const files = avatarFiles(parse({ ...base, dark }).data!);
    expect(files).toEqual(expect.arrayContaining(["poster.dark.webp", "invite.dark.mp4", "invite.dark.webm", "listen.dark.mp4", "listen.dark.webm", "speak.dark.mp4"]));
    expect(new Set(files).size).toBe(files.length);
    expect(avatarFiles(parse(base).data!)).not.toContain("poster.dark.webp");
  });

  it("is resolved to URLs, a missing part as null (the original is used then)", () => {
    const r = resolveAvatar(parse({ ...base, dark: { poster: "poster.dark.webp", listen: "listen.dark.mp4" } }).data!);
    expect(r.dark).toEqual({ poster: "/avatars/pack-d/poster.dark.webp", invite: null, idle: null, listen: { mp4: "/avatars/pack-d/listen.dark.mp4" }, speak: null });
  });
});

describe("the library checks the dark files", () => {
  const tmp = path.join(process.cwd(), ".test-tmp", "avatar-dark");
  fs.rmSync(tmp, { recursive: true, force: true });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const put = (files: Record<string, number>) => {
    const dir = path.join(tmp, "_avatars", "pack-d");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "avatar.json"), JSON.stringify({ ...base, dark }));
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes));
  };
  const ALL = { "poster.webp": 10, "invite.mp4": 10, "invite.webm": 10, "listen.mp4": 10, "listen.webm": 10, "speak.mp4": 10, "poster.dark.webp": 10, "invite.dark.mp4": 10, "invite.dark.webm": 10, "listen.dark.mp4": 10, "listen.dark.webm": 10, "speak.dark.mp4": 10 };

  it("a complete pack is valid", () => {
    put(ALL);
    expect(readAvatar(tmp, "pack-d").ok).toBe(true);
  });
  it("a missing dark file is named", () => {
    const { "speak.dark.mp4": _gone, ...rest } = ALL;
    void _gone;
    put(rest);
    const r = readAvatar(tmp, "pack-d");
    expect(r.ok).toBe(false);
    expect((r as any).issues.join("\n")).toContain('file "speak.dark.mp4" not found');
  });
  it("the dark poster has the poster limit, a dark loop the video limit", () => {
    put({ ...ALL, "poster.dark.webp": MAX_AVATAR_POSTER_BYTES + 1 });
    expect((readAvatar(tmp, "pack-d") as any).issues.join("\n")).toMatch(/poster\.dark\.webp" is .* more than the .* limit for a poster/);
    put({ ...ALL, "speak.dark.mp4": 4 * 1024 * 1024 + 1 });
    expect((readAvatar(tmp, "pack-d") as any).issues.join("\n")).toMatch(/speak\.dark\.mp4" is .* limit for an avatar video/);
  });
});

describe("the card shows the dark variants only in the dark theme", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let idleCallbacks: (() => void)[] = [];
  const html = document.documentElement;
  const pack = (withDark = true): ResolvedAvatar =>
    resolveAvatar(parse(withDark ? { ...base, dark } : base).data!, "Sofia");

  beforeEach(() => {
    idleCallbacks = [];
    html.setAttribute("data-theme", "light-editorial");
    (window as any).requestIdleCallback = (cb: () => void) => (idleCallbacks.push(cb), idleCallbacks.length);
    (window as any).cancelIdleCallback = () => {};
    (window as any).matchMedia = (q: string) => ({ matches: false && q.includes("reduce"), addEventListener() {}, removeEventListener() {} });
    HTMLVideoElement.prototype.canPlayType = () => "" as CanPlayTypeResult; // mp4 only: the sources are easy to read
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    document.body.innerHTML = "";
    html.removeAttribute("data-theme");
  });

  const mount = async (avatar: ResolvedAvatar, theme = "light-editorial") => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={avatar} theme={theme}>{null}</AgentAvatarCard>));
    await act(async () => idleCallbacks.splice(0).forEach((cb) => cb()));
  };
  const poster = () => document.querySelector(".avatar-card__poster")!.getAttribute("src");
  const video = (slot: string) => document.querySelector<HTMLVideoElement>(`video[data-slot="${slot}"]`);
  const setTheme = (t: string) => act(async () => void html.setAttribute("data-theme", t));

  it("the light theme uses the originals", async () => {
    await mount(pack());
    expect(poster()).toBe("/avatars/pack-d/poster.webp");
    expect(video("invite")!.getAttribute("src")).toBe("/avatars/pack-d/invite.mp4");
  });

  it("the dark theme uses the dark poster and loops", async () => {
    html.setAttribute("data-theme", "dark-premium");
    await mount(pack(), "dark-premium");
    expect(poster()).toBe("/avatars/pack-d/poster.dark.webp");
    expect(video("invite")!.getAttribute("src")).toBe("/avatars/pack-d/invite.dark.mp4");
  });

  it("the toggle switches the sources on the same elements, and back", async () => {
    await mount(pack());
    const el = video("invite")!;
    await setTheme("dark-premium");
    expect(video("invite")).toBe(el); // the element is kept: nothing remounts
    expect(el.getAttribute("src")).toBe("/avatars/pack-d/invite.dark.mp4");
    expect(poster()).toBe("/avatars/pack-d/poster.dark.webp");
    await setTheme("light-editorial");
    expect(el.getAttribute("src")).toBe("/avatars/pack-d/invite.mp4");
    expect(poster()).toBe("/avatars/pack-d/poster.webp");
  });

  it("a switch keeps the card's state: the call attributes and the widget slot do not change", async () => {
    await mount(pack());
    const card = document.querySelector<HTMLElement>(".avatar-card")!;
    card.setAttribute("data-call", "connected"); // not React's, but proves the element is the same one
    await setTheme("dark-premium");
    expect(document.querySelector(".avatar-card")).toBe(card);
    expect(card.getAttribute("data-call")).toBe("connected");
  });

  it("the loop picks up where it was after the switch (its position is carried over)", async () => {
    await mount(pack());
    const el = video("invite")!;
    Object.defineProperty(el, "duration", { configurable: true, value: 5 });
    el.currentTime = 1.7;
    await act(async () => void el.dispatchEvent(new Event("timeupdate")));
    await setTheme("dark-premium");
    el.currentTime = 0; // a reload starts over
    await act(async () => void el.dispatchEvent(new Event("loadedmetadata")));
    expect(el.currentTime).toBeCloseTo(1.7, 2);
    // and only once: the next metadata event (a later reload for another reason) does not jump
    el.currentTime = 0.3;
    await act(async () => void el.dispatchEvent(new Event("loadedmetadata")));
    expect(el.currentTime).toBeCloseTo(0.3, 2);
  });

  it("the dark video is not shown until it plays: the old one's state is dropped when the source changes", async () => {
    await mount(pack());
    const el = video("invite")!;
    await act(async () => void el.dispatchEvent(new Event("playing")));
    expect(el.getAttribute("data-active")).toBe("true");
    await setTheme("dark-premium");
    await act(async () => void el.dispatchEvent(new Event("emptied")));
    expect(el.getAttribute("data-active")).toBe("false");
    await act(async () => void el.dispatchEvent(new Event("playing")));
    expect(el.getAttribute("data-active")).toBe("true");
  });

  it("a slot without a dark file plays its original in the dark theme", async () => {
    const p = resolveAvatar(parse({ ...base, dark: { poster: "poster.dark.webp", invite: "invite.dark.mp4" } }).data!);
    html.setAttribute("data-theme", "dark-premium");
    await mount(p, "dark-premium");
    expect(video("invite")!.getAttribute("src")).toBe("/avatars/pack-d/invite.dark.mp4");
    await act(async () => void document.querySelector(".avatar-card")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(video("listen")!.getAttribute("src")).toBe("/avatars/pack-d/listen.mp4");
  });

  it("a pack without dark files shows the same in both themes", async () => {
    html.setAttribute("data-theme", "dark-premium");
    await mount(pack(false), "dark-premium");
    expect(poster()).toBe("/avatars/pack-d/poster.webp");
    expect(video("invite")!.getAttribute("src")).toBe("/avatars/pack-d/invite.mp4");
  });

  it("a dark file that fails to load falls back to the original, for the poster and every loop", async () => {
    html.setAttribute("data-theme", "dark-premium");
    await mount(pack(), "dark-premium");
    await act(async () => void video("invite")!.dispatchEvent(new Event("error")));
    expect(video("invite")!.getAttribute("src")).toBe("/avatars/pack-d/invite.mp4");
    expect(poster()).toBe("/avatars/pack-d/poster.webp");
  });

  it("a dark poster that fails to load falls back to the originals too (for example when the images step has not copied the new files yet)", async () => {
    html.setAttribute("data-theme", "dark-premium");
    await mount(pack(), "dark-premium");
    expect(poster()).toBe("/avatars/pack-d/poster.dark.webp");
    await act(async () => void document.querySelector(".avatar-card__poster")!.dispatchEvent(new Event("error")));
    expect(poster()).toBe("/avatars/pack-d/poster.webp");
    expect(video("invite")!.getAttribute("src")).toBe("/avatars/pack-d/invite.mp4");
  });

  it("the server's markup follows the product's theme (so hydration matches), then the real theme wins", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    expect(renderToStaticMarkup(<AgentAvatarCard avatar={pack()} theme="dark-premium">{null}</AgentAvatarCard>)).toContain("poster.dark.webp");
    expect(renderToStaticMarkup(<AgentAvatarCard avatar={pack()} theme="light-editorial">{null}</AgentAvatarCard>)).not.toContain("poster.dark.webp");
  });
});

describe("the dark theme's card look (tokens in the theme file)", () => {
  const theme = (t: string) => fs.readFileSync(path.join(process.cwd(), "public", "themes", `${t}.css`), "utf8");
  it("dark: navy stage, a gold ring and glow, a 1px accent edge with a faint halo", () => {
    const css = theme("dark-premium");
    expect(css).toContain("--avatar-stage: #243049;");
    expect(css).toMatch(/--avatar-ring: linear-gradient\(90deg, #b8923f 0%, #d4af5a 55%, #e6c97a 100%\);/);
    expect(css).toMatch(/--avatar-glow: rgba\(212, 175, 90, 0\.45\);/);
    expect(css).toMatch(/--avatar-edge: 0 0 0 1px var\(--accent\), 0 0 0 6px color-mix\(in srgb, var\(--accent\) 8%, transparent\);/);
  });
  it("light: exactly as before (the dark stage, the Hanc ring and glow, no edge)", () => {
    const css = theme("light-editorial");
    expect(css).toContain("--avatar-stage: #120e0c;");
    expect(css).toContain("--avatar-ring: linear-gradient(90deg, #f97316 0%, #f43f5e 55%, #ec4899 100%);");
    expect(css).toContain("--avatar-glow: rgba(242, 85, 31, 0.55);");
    expect(css).not.toContain("--avatar-edge");
  });
});
