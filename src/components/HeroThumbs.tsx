"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { HERO_THUMB_MIN_REM } from "@/lib/hero-thumbs";

/**
 * The column of thumbnails beside the hero photo (see Hero.tsx and the .hero__thumbs CSS). The grid gives the column the room that is left of the
 * left column; with less than HERO_THUMB_MIN_REM of it (or where the column is not drawn: narrow and short windows) the thumbnails are not rendered,
 * so they take no room and cannot be tabbed to. Measured before the first paint and again when the column changes size. The server renders them,
 * so without script they are there.
 */
export function HeroThumbs({ children }: { children: ReactNode }) {
  const column = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return;
    const check = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setFits(el.getBoundingClientRect().width >= HERO_THUMB_MIN_REM * rem);
    };
    check();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return (
    <div ref={column} className="hero__thumbs">
      {fits ? children : null}
    </div>
  );
}
