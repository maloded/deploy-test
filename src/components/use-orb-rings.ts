"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CallPhase } from "@/lib/call-outcome";
import { BURST_AFTER, BURST_SETTLES, ringsState, type RingsState } from "@/lib/orb-rings";

/**
 * The state of the orb's rings (lib/orb-rings.ts): `card` is watched for being on screen (30%, as on Hanc), the first press or focus on its
 * action area ends the invitation, and the authored moment plays once per page view. Returns the value for `data-rings`.
 */
export function useOrbRings(card: RefObject<HTMLElement | null>, phase: CallPhase): RingsState {
  const [used, setUsed] = useState(false);
  const [inView, setInView] = useState(true);
  const [stage, setStage] = useState<"waiting" | "bursting" | "over">("waiting");
  const [called, setCalled] = useState(false);
  if (phase !== "idle" && !called) setCalled(true); // a call attempt ends the invitation for good

  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const touch = () => setUsed(true);
    const action = el.querySelector(".avatar-card__action");
    action?.addEventListener("pointerdown", touch);
    action?.addEventListener("focusin", touch);
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.intersectionRatio >= 0.3)), { threshold: [0, 0.3, 1] });
    io.observe(el);
    return () => {
      action?.removeEventListener("pointerdown", touch);
      action?.removeEventListener("focusin", touch);
      io.disconnect();
    };
  }, [card]);

  // the authored moment is decided once, when its time comes: it plays only for somebody who can see it and has not touched the button
  const seen = useRef({ inView, used: used || called });
  useEffect(() => {
    seen.current = { inView, used: used || called };
  });
  useEffect(() => {
    const start = window.setTimeout(() => setStage(document.hidden || !seen.current.inView || seen.current.used ? "over" : "bursting"), BURST_AFTER);
    return () => window.clearTimeout(start);
  }, []);
  useEffect(() => {
    if (stage !== "bursting") return;
    const settle = window.setTimeout(() => setStage("over"), BURST_SETTLES);
    return () => window.clearTimeout(settle);
  }, [stage]);

  const used_ = used || called;
  return ringsState({ phase, used: used_, inView, momentOver: stage === "over", bursting: stage === "bursting" && !used_ && inView });
}
