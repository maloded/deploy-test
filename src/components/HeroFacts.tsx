"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FACT_ROW_MIN_WIDTH, fitFacts, type FactNeed } from "@/lib/fact-fit";

/** Re-fits the facts in one row (see lib/fact-fit.ts): the values' size scales down, within limits, when a language or a font needs more room than the row has. */
function useFactFit(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia?.("(min-width: 56em)");
    let last = "";
    const apply = (scale: string, fit: string | null) => {
      const key = `${scale}|${fit}`;
      if (key === last) return;
      last = key;
      el.style.setProperty("--fact-scale", scale);
      if (fit) el.dataset.row = fit;
      else delete el.dataset.row;
    };
    const run = () => {
      if (!wide?.matches || el.clientWidth < FACT_ROW_MIN_WIDTH) return apply("1", null); // a phone or a tablet: the layouts as they were
      // measure at the natural size, one line per value, each label at its narrowest
      el.style.setProperty("--fact-scale", "1");
      delete el.dataset.row;
      const facts = Array.from(el.querySelectorAll<HTMLElement>(".hero__fact"));
      const needs: FactNeed[] = facts.map((f) => {
        const value = f.querySelector<HTMLElement>(".hero__fact-value");
        const label = f.querySelector<HTMLElement>(".hero__fact-label");
        let v = 0;
        if (value) {
          const r = document.createRange();
          r.selectNodeContents(value);
          v = r.getBoundingClientRect().width;
        }
        let l = 0;
        if (label) {
          const before = label.style.width;
          label.style.width = "min-content";
          l = label.getBoundingClientRect().width;
          label.style.width = before;
        }
        return { value: v, label: l };
      });
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const { scale, wrap } = fitFacts(needs, el.clientWidth, gap);
      last = "";
      apply(String(scale), wrap ? "wrap" : "one");
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
  }, [ref]);
}

/**
 * The key facts' block with its one entrance: the facts fade and slide in, one after the other, the first time the block is on screen (the CSS does the
 * moving, from data-reveal: "pending" until then, then "in"; see .hero__facts[data-reveal]). The server renders "pending", so nothing blinks when the page
 * loads with the block already in view; the CSS only hides them when motion is welcome, and shows them anyway after a few seconds, so a page whose script
 * never runs does not keep them hidden. The block's room is always reserved (opacity and a small shift do not move the layout).
 */
export function HeroFacts({ children }: { children: ReactNode }) {
  const block = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"pending" | "in">("pending");
  useFactFit(block);
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
