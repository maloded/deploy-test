// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PACK: ResolvedAvatar = { id: "test-pack", name: "Test pack", poster: "/avatars/test-pack/poster.webp", idle: null, listen: null, speak: null };

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
  const layer = () => document.querySelector<HTMLElement>(".avatar-card__tilt")!;
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

  it("turns the picture layer toward the pointer, and puts it back flat on pointer leave", async () => {
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    run();
    expect(layer().style.transform).toBe("rotateX(0.000deg) rotateY(7.000deg)");
    pointer(card, "pointerleave", 0, 0);
    run();
    expect(layer().style.transform).toBe("");
  });

  it("never turns more than 7 / 5 degrees, however the pointer sits at the edge", async () => {
    const card = await mount();
    pointer(card, "pointermove", 100, 200);
    run();
    expect(layer().style.transform).toBe("rotateX(5.000deg) rotateY(-7.000deg)");
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
    expect(layer().style.transform).not.toBe("");
    pointer(card, "pointermove", 700, 40);
    run();
    expect(layer().style.transform).toBe("");
  });

  it("ignores touch", async () => {
    const card = await mount();
    pointer(card, "pointermove", 300, 325, "touch");
    expect(frames).toHaveLength(0);
    expect(layer().style.transform).toBe("");
  });

  it("is off with prefers-reduced-motion", async () => {
    reduced = true;
    const card = await mount();
    pointer(card, "pointermove", 300, 325);
    expect(frames).toHaveLength(0);
    expect(layer().style.transform).toBe("");
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
    expect(layer().style.transform).not.toBe("");
    reduced = true;
    act(() => changeListeners.slice().forEach((l) => l()));
    expect(layer().style.transform).toBe("");
    pointer(card, "pointermove", 300, 325);
    expect(frames).toHaveLength(0);
  });

  it("the widget is a sibling of the stage, not inside the stage or the tilt layer (nothing transformed above it)", async () => {
    const card = await mount();
    const widget = card.querySelector("hanc-ai-pill-floating-call")!;
    const stage = card.querySelector(".avatar-card__stage")!;
    expect(stage.contains(widget)).toBe(false);
    expect(layer().contains(widget)).toBe(false);
    expect(widget.closest(".avatar-card__action")!.parentElement).toBe(card);
    expect(stage.parentElement).toBe(card);
    for (let el: Element | null = widget; el; el = el.parentElement) {
      expect(el.classList.contains("avatar-card__stage") || el.classList.contains("avatar-card__tilt")).toBe(false);
    }
  });

  it("renders no transform on the server", () => {
    expect(renderToStaticMarkup(<AgentAvatarCard avatar={PACK}>x</AgentAvatarCard>)).not.toMatch(/transform|perspective/);
  });
});
