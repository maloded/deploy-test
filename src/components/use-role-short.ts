"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Whether the job line under the name has to use the language codes ("DE, EN") because its full text ("Deutsch, English") would not stay on one line.
 * Measured, not guessed: the full text is set in a hidden copy of the line (same font, no wrapping) and compared with the room the line has now; it is
 * measured again when the card is resized and when the fonts have loaded. Hanc's role line is the same size as ours (0.875rem) and has the whole card
 * width, ours stops short of the call button, so a smaller font would not be enough (it would have to be about 0.6em). If even the codes do not fit,
 * the line wraps as before (a seller with many languages).
 */
export function useRoleShort(role: RefObject<HTMLElement | null>, full: string): boolean {
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const el = role.current;
    if (!el) return;
    const check = () => {
      const room = el.clientWidth;
      if (!room) return; // not laid out (the narrow docked card has no plate): keep what it was
      const style = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;font:${style.font};letter-spacing:${style.letterSpacing}`;
      probe.textContent = full;
      el.parentElement?.appendChild(probe);
      const need = probe.getBoundingClientRect().width;
      probe.remove();
      setShort(need > room - 1); // a pixel to spare: the line and its copy round their widths differently
    };
    check();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    void document.fonts?.ready.then(check);
    return () => ro?.disconnect();
  }, [role, full]);
  return short;
}
