// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PACK: ResolvedAvatar = { id: "test-pack", name: "Test pack", poster: "/avatars/test-pack/poster.webp", idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "dot" };

describe("the tilt in the DOM", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let reduced = false;
  let hoverFine = true;
  let frames: FrameRequestCallback[] = [];
  let changeListeners: (() => void)[] = [];

  beforeEach(() => {
    reduced = false;
    hoverFine = true;
    frames = [];
    changeListeners = [];
    (window as any).requestIdleCallback = () => 1;
    (window as any).cancelIdleCallback = () => {};
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => (frames.push(cb), frames.length);
    (window as any).cancelAnimationFrame = () => void (frames = []);
    (window as any).matchMedia = (q: string) => ({
      get matches() {
        return q.includes("reduce") ? reduced : q.includes("hover") ? hoverFine : false;
      },
      addEventListener: (_: string, cb: () => void) => changeListeners.push(cb),
      removeEventListener: (_: string, cb: () => void) => void (changeListeners = changeListeners.filter((l) => l !== cb)),
    });
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
  });

  const mount = async () => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={PACK}>{createElement("hanc-ai-pill-floating-call", { position: "static" })}</AgentAvatarCard>));
    const card = document.querySelector<HTMLElement>(".avatar-card")!;
    card.getBoundingClientRect = () => ({ left: 100, top: 200, width: 200, height: 250, right: 300, bottom: 450, x: 100, y: 200, toJSON() {} });
    return card;
  };
  const frame = () => document.querySelector<HTMLElement>(".avatar-card__frame")!;
  const pointer = (card: Element, type: string, x: number, y: number, pointerType = "mouse") => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(e, "pointerType", { value: pointerType });
    act(() => void card.dispatchEvent(e));
  };
  /** Runs animation frames, 16 ms apart, until the spring has stopped asking for more. */
  const run = (limit = 400) => {
    let t = 1000;
    for (let i = 0; i < limit && frames.length; i++) {
      const batch = frames.splice(0);
      t += 16;
      act(() => batch.forEach((cb) => cb(t)));
    }
  };

  it("turns the whole frame toward the pointer (perspective inside the transform), and after leaving and settling its inline transform is empty again", async () => {
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    run();
    expect(frame().style.transform).toBe("perspective(56rem) rotateX(0.000deg) rotateY(7.000deg)");
    pointer(card, "pointerleave", 0, 0);
    run();
    expect(frame().style.transform).toBe("");
  });

  it("never turns more than 7 / 5 degrees, however the pointer sits at the edge", async () => {
    const card = await mount();
    pointer(card, "pointermove", 100, 200);
    run();
    expect(frame().style.transform).toBe("perspective(56rem) rotateX(5.000deg) rotateY(-7.000deg)");
  });

  it("moves in animation frames: a burst of pointer moves asks for one frame", async () => {
    const card = await mount();
    for (let i = 0; i < 20; i++) pointer(card, "pointermove", 150 + i, 300);
    expect(frames).toHaveLength(1);
  });

  it("lies flat when a pointer event reaches the card from outside its box (the widget's full-screen form is open)", async () => {
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    run();
    expect(frame().style.transform).not.toBe("");
    pointer(card, "pointermove", 700, 40);
    run();
    expect(frame().style.transform).toBe("");
  });

  it("ignores touch", async () => {
    const card = await mount();
    pointer(card, "pointermove", 300, 325, "touch");
    expect(frames).toHaveLength(0);
    expect(frame().style.transform).toBe("");
  });

  it("is off with prefers-reduced-motion", async () => {
    reduced = true;
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    expect(frames).toHaveLength(0);
    expect(frame().style.transform).toBe("");
  });

  it("is off without a hovering fine pointer (a phone, a tablet)", async () => {
    hoverFine = false;
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    expect(frames).toHaveLength(0);
  });

  it("follows a change of the setting: reduced motion switched on flattens the card at once", async () => {
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    run();
    expect(frame().style.transform).not.toBe("");
    reduced = true;
    act(() => changeListeners.slice().forEach((l) => l()));
    expect(frame().style.transform).toBe("");
    pointer(card, "pointermove", 300, 325);
    expect(frames).toHaveLength(0);
  });

  it("the widget is a sibling of the frame, not inside it, and no ancestor of it is the frame (nothing transformed above it)", async () => {
    const card = await mount();
    const widget = card.querySelector("hanc-ai-pill-floating-call")!;
    expect(frame().contains(widget)).toBe(false);
    expect(widget.closest(".avatar-card__action")!.parentElement).toBe(card);
    expect(frame().parentElement).toBe(card);
    for (let el: Element | null = widget; el; el = el.parentElement) expect(el.classList.contains("avatar-card__frame")).toBe(false);
  });

  it("the pointer listener is on the untransformed container: a move over the frame's own box reaches it", async () => {
    const card = await mount();
    const e = new MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 325 });
    Object.defineProperty(e, "pointerType", { value: "mouse" });
    act(() => void frame().dispatchEvent(e)); // dispatched on the frame, caught on the card by bubbling
    run();
    expect(frame().style.transform).toContain("rotateY(7.000deg)");
    expect(card.style.transform).toBe("");
  });

  it("renders no transform on the server", () => {
    expect(renderToStaticMarkup(<AgentAvatarCard avatar={PACK}>x</AgentAvatarCard>)).not.toMatch(/transform|perspective/);
  });

  it("renders the caption (name, tagline, badge) inside the frame in the page language, and none without text", async () => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    const withCaption = { ...PACK, caption: { tagline: { en: "Happy to help.", de: "Gern zu Diensten." }, badge: { en: "AI assistant", de: "KI-Assistent" } } };
    await act(async () => root!.render(<AgentAvatarCard avatar={withCaption} lang="de">x</AgentAvatarCard>));
    const cap = document.querySelector(".avatar-card__frame .avatar-card__caption")!;
    expect(cap.textContent).toBe("Test packKI-AssistentGern zu Diensten."); // no separator in the text: it is drawn by CSS
    expect(cap.querySelector(".avatar-card__title .avatar-card__name")!.nextElementSibling!.className).toBe("avatar-card__badge"); // the marker is on the name line
    expect(document.querySelector(".avatar-card")!.classList.contains("avatar-card--caption")).toBe(true);
    expect(document.querySelector(".avatar-card__action .avatar-card__caption")).toBeNull();
    await act(async () => root!.render(<AgentAvatarCard avatar={{ ...withCaption, caption: { tagline: null, badge: { en: "AI assistant" } } }} lang="en">x</AgentAvatarCard>));
    expect(document.querySelector(".avatar-card__tagline")).toBeNull();
    expect(document.querySelector(".avatar-card__badge")!.textContent).toBe("AI assistant");
    await act(async () => root!.render(<AgentAvatarCard avatar={PACK} lang="en">x</AgentAvatarCard>));
    expect(document.querySelector(".avatar-card__caption")).toBeNull();
    expect(document.querySelector(".avatar-card")!.classList.contains("avatar-card--caption")).toBe(false);
  });
});
