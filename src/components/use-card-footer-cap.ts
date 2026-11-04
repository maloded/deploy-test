"use client";

import { useEffect, type RefObject } from "react";
import type { Placement } from "./use-card-placement";

/** The gap between the docked card's bottom edge and the footer's top edge when the card has been stopped by the footer, in px (within 24 to 48). */
export const FOOTER_GAP = 32;

/**
 * How far (px) the docked card must be lifted from its place in the corner so that its bottom edge is at least `gap` above the footer's top edge. 0 while the
 * footer is further down than that (the card is where it always is). Pure, so a test can check it.
 */
export function footerLift({ viewportHeight, footerTop, base, gap = FOOTER_GAP }: { viewportHeight: number; footerTop: number; base: number; gap?: number }): number {
  const cardBottom = viewportHeight - base; // the card's bottom edge in the corner, from the top of the window
  return Math.max(0, Math.round(cardBottom - (footerTop - gap)));
}

/**
 * The docked card stops above the footer: when the page reaches the footer the card does not sit over it but rises with it (it scrolls up with the page), the way the
 * reference site caps its panel. It moves by `bottom` (the custom property --avatar-card-lift, added to the card's usual offset in the CSS), never by a transform: the
 * card and its ancestors may carry none (see the CSS guard test). Only with the full docked card: the phone's call bar (the layout without a card in the corner) is
 * left as it is, and so is the card in the hero.
 */
export function useCardFooterCap(card: RefObject<HTMLElement | null>, placement: Placement) {
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const footer = document.querySelector<HTMLElement>('footer[data-block="footer"]');
    if (placement !== "dock" || !footer) {
      el.style.removeProperty("--avatar-card-lift");
      return;
    }
    let lift = 0;
    let frame = 0;
    const apply = (next: number) => {
      if (next === lift) return;
      lift = next;
      if (next === 0) el.style.removeProperty("--avatar-card-lift");
      else el.style.setProperty("--avatar-card-lift", `${next}px`);
    };
    const update = () => {
      frame = 0;
      // the card in the corner only (the phone bar and tiny windows do not use it)
      if (window.matchMedia?.("(width < 56.25em), (height < 32.5em)").matches) return apply(0);
      const base = parseFloat(getComputedStyle(el).bottom) - lift; // the offset without the lift
      if (!Number.isFinite(base)) return;
      apply(footerLift({ viewportHeight: window.innerHeight, footerTop: footer.getBoundingClientRect().top, base }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(footer); // the footer changes height (a wrapped line, a language switch)
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty("--avatar-card-lift");
    };
  }, [card, placement]);
}
