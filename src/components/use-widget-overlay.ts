"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether the widget's full-screen form is open over the card. The form is in the widget's shadow DOM (no event, no public flag), but a pointer
 * event that reaches the card from outside the card's own box can only have come through that overlay (the same reasoning as the tilt's): the
 * first such event says it is open, and the pointer leaving the card (it is then over the page again) says it is closed. Any pointer type.
 */
export function useWidgetOverlay(card: RefObject<HTMLElement | null>): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const look = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      setOpen((was) => (was === outside ? was : outside));
    };
    const leave = () => setOpen(false);
    el.addEventListener("pointermove", look, { passive: true });
    el.addEventListener("pointerdown", look, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", look);
      el.removeEventListener("pointerdown", look);
      el.removeEventListener("pointerleave", leave);
    };
  }, [card]);
  return open;
}
