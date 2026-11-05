"use client";

import { useLayoutEffect } from "react";
import { heroFit, type HeroFitParts } from "@/lib/hero-fit";

/**
 * Keeps the hero's measured fits (the facts in one row, the invitation on one line, the card's column) right after the first one, which the inline script
 * (heroFitScript) did before the first paint: again when the window or the hero changes size and when a font has arrived. The same function does all of it.
 */
export function HeroFit({ parts }: { parts: HeroFitParts }) {
  useLayoutEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const run = () => heroFit(hero, parts);
    run();
    const watched = [hero, ...Object.values(parts).filter((q): q is string => Boolean(q) && q !== parts.slot).map((q) => hero.querySelector(q))];
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(run);
    for (const el of watched) if (el) ro?.observe(el);
    window.addEventListener("resize", run);
    document.fonts?.addEventListener?.("loadingdone", run);
    void document.fonts?.ready.then(run);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", run);
      document.fonts?.removeEventListener?.("loadingdone", run);
    };
  }, [parts]);
  return null;
}
