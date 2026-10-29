"use client";

import { useEffect, type RefObject } from "react";
import { REST_SPRING, atRest, springStep, tiltAllowed, tiltTarget, tiltTransform, type Spring, type Tilt } from "@/lib/card-tilt";

const REDUCED = "(prefers-reduced-motion: reduce)";
const HOVER_FINE = "(hover: hover) and (pointer: fine)";
const FLAT: Tilt = { x: 0, y: 0 };

/**
 * Turns `frame` (the card's border, radius, clipping and pictures) toward the pointer while the pointer is over `card`, the untransformed
 * container, so the hit area does not move with the tilt. The widget is a sibling of the frame, never inside it.
 * A critically damped spring runs in requestAnimationFrame only while it moves; pointermove just sets the target. Off with
 * prefers-reduced-motion and without a hovering fine pointer (checked again when either changes); touch pens and mice only.
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

  const frame = (time: number) => {
    spring = springStep(spring, target, (time - last) / 1000 || 0.016);
    last = time;
    if (atRest(spring, target)) {
      spring = { ...target, vx: 0, vy: 0 };
      frameEl.style.transform = target === FLAT ? "" : tiltTransform(spring);
      raf = 0;
      return;
    }
    frameEl.style.transform = tiltTransform(spring);
    raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const aim = (next: Tilt) => {
    target = next;
    kick();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    aim(tiltTarget(cardEl.getBoundingClientRect(), e.clientX, e.clientY) ?? FLAT);
  };
  const onLeave = () => aim(FLAT);

  cardEl.addEventListener("pointermove", onMove, { passive: true });
  cardEl.addEventListener("pointerleave", onLeave);
  return () => {
    cardEl.removeEventListener("pointermove", onMove);
    cardEl.removeEventListener("pointerleave", onLeave);
    cancelAnimationFrame(raf);
    frameEl.style.transform = "";
  };
}
