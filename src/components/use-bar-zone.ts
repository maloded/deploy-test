"use client";

import { useEffect, useState } from "react";

/** The blocks the call bar stays out of while the visitor is not in a call: the offer card and the footer. */
export const BAR_ZONES = '[data-block="offer"], [data-block="footer"]';

/**
 * Whether one of the BAR_ZONES is in the strip of the screen where the bar stands (the bottom 20% of the window), so the idle bar can step aside
 * instead of covering the offer card's text and buttons or the footer. Not in a call: the bar is always there then (the card's CSS decides).
 */
export function useBarZone(enabled: boolean): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const zones = Array.from(document.querySelectorAll(BAR_ZONES));
    if (zones.length === 0) return;
    const now = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) now.add(e.target);
          else now.delete(e.target);
        }
        setInside(now.size > 0);
      },
      { rootMargin: "-80% 0px 0px 0px" }, // the root is the window's bottom fifth
    );
    for (const z of zones) io.observe(z);
    return () => io.disconnect();
  }, [enabled]);
  return enabled && inside;
}
