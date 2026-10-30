"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The key facts' block with its one entrance: the facts fade and slide in, one after the other, the first time the block is on screen (the CSS does the
 * moving, from data-reveal: "pending" until then, then "in"; see .hero__facts[data-reveal]). The server renders "pending", so nothing blinks when the page
 * loads with the block already in view; the CSS only hides them when motion is welcome, and shows them anyway after a few seconds, so a page whose script
 * never runs does not keep them hidden. The block's room is always reserved (opacity and a small shift do not move the layout).
 */
export function HeroFacts({ children }: { children: ReactNode }) {
  const block = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"pending" | "in">("pending");
  useEffect(() => {
    const el = block.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return; // the CSS failsafe shows the facts after 2s
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setState("in");
        io.disconnect(); // once
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={block} className="hero__facts" data-reveal={state}>
      {children}
    </div>
  );
}
