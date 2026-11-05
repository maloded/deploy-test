"use client";

import { useLayoutEffect, useRef } from "react";
import { fitLine } from "@/lib/fact-fit";

/**
 * The invitation's question above the agent's card. On a wide window it stays on ONE line whatever the language or the font: if its text is wider than the
 * column, the size scales down (--intro-scale, 0.75 at the least, see .hero__aside .sofia-intro__heading) and, only beyond that, the CSS ends it with an
 * ellipsis. It must never wrap: the block grows upward from the card, so a second line would slide under the header. On a phone it is a normal wrapping line.
 */
export function IntroHeading({ children }: { children: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia?.("(min-width: 56em)");
    const run = () => {
      if (!wide?.matches) return el.style.removeProperty("--intro-scale");
      el.style.setProperty("--intro-scale", "1");
      const r = document.createRange();
      r.selectNodeContents(el);
      const scale = fitLine(r.getBoundingClientRect().width, el.clientWidth);
      el.style.setProperty("--intro-scale", String(scale));
    };
    run();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(run);
    ro?.observe(el);
    window.addEventListener("resize", run);
    document.fonts?.addEventListener?.("loadingdone", run);
    void document.fonts?.ready.then(run);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", run);
      document.fonts?.removeEventListener?.("loadingdone", run);
    };
  }, [children]);
  return (
    <p ref={ref} className="sofia-intro__heading">
      {children}
    </p>
  );
}
