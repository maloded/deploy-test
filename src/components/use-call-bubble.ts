"use client";

import { useEffect, type RefObject } from "react";
import type { InviteCue } from "@/lib/avatar-manifest";
import { bubbleOn, lettersAt } from "@/lib/call-bubble";

/**
 * Puts the call bubble up and takes it down by the invite loop's own clock (HeroStage.astro does the same per animation frame): while `enabled`
 * every frame reads `video.currentTime` and sets `data-on` on the bubble to `bubbleOn(time, cue)`, and "false" whenever the video is missing or
 * paused. Disabled (a call, the form overlay, the loop not on screen), it is down at once. The CSS animates the attribute.
 * The line is typed as Hanc types it (HeroStage.astro, `bubble`/`write`): while the bubble is up, each frame writes the first `lettersAt(time)` letters into
 * [data-typed] and the rest into the transparent [data-rest], so the box never changes size; nothing is written on the way out (it leaves whole) and the
 * next loop starts again from no letters, with no caret (Hanc has none on this bubble).
 */
export function useCallBubble(bubble: RefObject<HTMLElement | null>, video: () => HTMLVideoElement | null | undefined, cue: InviteCue | null, enabled: boolean, text: string): void {
  useEffect(() => {
    const el = bubble.current;
    if (!el) return;
    const set = (on: boolean) => {
      if (el.getAttribute("data-on") !== String(on)) el.setAttribute("data-on", String(on));
    };
    const typed = el.querySelector<HTMLElement>("[data-typed]");
    const rest = el.querySelector<HTMLElement>("[data-rest]");
    let said = -1;
    const write = (n: number) => {
      if (n === said || !typed || !rest) return;
      said = n;
      typed.textContent = text.slice(0, n);
      rest.textContent = text.slice(n);
    };
    if (!enabled || !cue) {
      set(false);
      return;
    }
    let raf = 0;
    const tick = () => {
      const v = video();
      const on = Boolean(v) && !v!.paused && bubbleOn(v!.currentTime, cue);
      // letters only move while it is up; on its way out it leaves whole
      if (on) write(lettersAt(v!.currentTime, cue, text));
      set(on);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      set(false);
    };
  }, [bubble, video, cue, enabled, text]);
}
