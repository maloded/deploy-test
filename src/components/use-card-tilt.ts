"use client";

import { useEffect, type RefObject } from "react";
import { REST_TRANSFORM, REST_SPRING, atRest, glintTransform, springStep, tiltAllowed, tiltTarget, tiltTransform, type Spring, type Tilt } from "@/lib/card-tilt";

const REDUCED = "(prefers-reduced-motion: reduce)";
const HOVER_FINE = "(hover: hover) and (pointer: fine)";
const FLAT: Tilt = { x: 0, y: 0 };

/**
 * The hover tilt of the Hanc role card (see lib/card-tilt.ts for its constants). Turns `frame` (the pictures, the layers and the text)
 * toward the pointer while the pointer is over `card`, the untransformed container, so the hit area does not move; slides the light layer
 * (`[data-glint]`) with it, sets `data-tilting` on the card while the pointer is on it, and gives the layers marked `data-depth="<px>"`
 * their depth (translateZ) inside the frame's perspective. The widget is a sibling of the frame, never inside it.
 * The spring runs in requestAnimationFrame only while it moves; pointermove just sets the target. Off with prefers-reduced-motion and
 * without a hovering fine pointer (checked again when either changes); mice and pens only. When it is off nothing is transformed at all.
 *
 * The widget's full-screen form is in its shadow DOM, so there is no event for it. It does reach the card, though: a pointer event
 * that arrives from outside the card's box came through that overlay (see tiltTarget), and then the card lies flat.
 */
export function useCardTilt(card: RefObject<HTMLElement | null>, frame: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const cardEl = card.current;
    const frameEl = frame.current;
    const reduced = window.matchMedia?.(REDUCED);
    const hover = window.matchMedia?.(HOVER_FINE);
    if (!cardEl || !frameEl || !hover) return;

    let stop: (() => void) | null = null;
    const sync = () => {
      const allowed = tiltAllowed({ reducedMotion: Boolean(reduced?.matches), hoverFine: hover.matches });
      if (allowed && !stop) stop = start(cardEl, frameEl);
      else if (!allowed && stop) {
        stop();
        stop = null;
      }
    };
    sync();
    reduced?.addEventListener?.("change", sync);
    hover.addEventListener?.("change", sync);
    return () => {
      reduced?.removeEventListener?.("change", sync);
      hover.removeEventListener?.("change", sync);
      stop?.();
    };
  }, [card, frame]);
}

function start(cardEl: HTMLElement, frameEl: HTMLElement): () => void {
  let spring: Spring = REST_SPRING;
  let target: Tilt = FLAT;
  let raf = 0;
  let last = 0;
  const depth = new Set<HTMLElement>();

  // the layers with a depth are found when the pointer arrives (the captions come and go with the call and the placement)
  const placeDepth = () => {
    for (const el of frameEl.querySelectorAll<HTMLElement>("[data-depth]")) {
      if (depth.has(el)) continue;
      el.style.transform = `translateZ(${Number(el.dataset.depth) || 0}px)`;
      depth.add(el);
    }
    for (const el of depth) if (!el.isConnected) depth.delete(el);
  };
  const glint = () => cardEl.querySelector<HTMLElement>("[data-glint]");

  const paint = () => {
    frameEl.style.transform = tiltTransform(spring);
    const g = glint();
    if (g) g.style.transform = glintTransform(spring);
  };
  const frame = (time: number) => {
    spring = springStep(spring, target, (time - last) / 1000 || 0.016);
    last = time;
    if (atRest(spring, target)) {
      spring = { ...target, vx: 0, vy: 0 }; // the last thousandth of a step is not worth a frame: settle exactly on the target
      paint();
      if (target === FLAT) frameEl.style.transform = REST_TRANSFORM;
      raf = 0;
      return;
    }
    paint();
    raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const aim = (next: Tilt | null) => {
    target = next ?? FLAT;
    if (next) cardEl.dataset.tilting = "";
    else delete cardEl.dataset.tilting;
    kick();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    placeDepth();
    aim(tiltTarget(cardEl.getBoundingClientRect(), e.clientX, e.clientY));
  };
  const onLeave = () => aim(null);

  frameEl.style.transform = REST_TRANSFORM;
  cardEl.addEventListener("pointermove", onMove, { passive: true });
  cardEl.addEventListener("pointerleave", onLeave);
  return () => {
    cardEl.removeEventListener("pointermove", onMove);
    cardEl.removeEventListener("pointerleave", onLeave);
    cancelAnimationFrame(raf);
    delete cardEl.dataset.tilting;
    frameEl.style.transform = "";
    const g = glint();
    if (g) g.style.transform = "";
    for (const el of depth) el.style.transform = "";
  };
}
