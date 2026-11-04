"use client";

import { useEffect, useState } from "react";

/** The blocks the call bar stays out of while the visitor is not in a call: the offer section (any part of it in the window) and the footer (in the bottom fifth). */
export const OFFER_ZONE = '[data-block="offer"]';
export const FOOTER_ZONE = '[data-block="footer"]';
export const BAR_ZONES = `${OFFER_ZONE}, ${FOOTER_ZONE}`;

/**
 * Whether the idle call bar should step aside: any part of the offer section is in the window (its price band and buttons must never sit under the bar), or the footer is
 * in the strip of the screen where the bar stands (the bottom 20% of the window; its last lines must stay readable). Not in a call: the bar is always there then
 * (the card's CSS decides).
 */
export function useBarZone(enabled: boolean): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const now = new Set<Element>();
    const watch = (selector: string, rootMargin: string) => {
      const zones = Array.from(document.querySelectorAll(selector));
      if (zones.length === 0) return null;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) now.add(e.target);
            else now.delete(e.target);
          }
          setInside(now.size > 0);
        },
        { rootMargin },
      );
      for (const z of zones) io.observe(z);
      return io;
    };
    const observers = [watch(OFFER_ZONE, "0px"), watch(FOOTER_ZONE, "-80% 0px 0px 0px")]; // the footer's root is the window's bottom fifth
    return () => observers.forEach((io) => io?.disconnect());
  }, [enabled]);
  return enabled && inside;
}
