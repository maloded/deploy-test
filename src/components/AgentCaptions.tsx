"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CallPhase } from "@/lib/call-outcome";
import type { ExampleLine } from "@/lib/avatar-manifest";
import type { Language } from "@/lib/languages";
import { ui, uiFmt } from "@/lib/ui-strings";
import { createExampleCall } from "./example-call";

const REDUCED = "(prefers-reduced-motion: reduce)";
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * The text block over the foot of the large card (ported from the Hanc role hero, RoleHero.astro): the level bars and a label, and under it
 * either the example call, typed in line by line while nobody calls (components/example-call.ts), or, from the moment a call starts, the
 * status line of the call: connecting, live (with the running time), not started, dropped, microphone blocked. The example is hidden for
 * as long as a call is on or has failed; it runs only while the card is on screen and the tab is visible, and with reduced motion it shows
 * its first two lines, still. Without an example the block exists only for the status line.
 * `card` is the untransformed container (it carries `data-talking`, the bars' cue).
 */
export function AgentCaptions({
  card,
  example,
  name,
  lang,
  phase,
  blocked,
  startLabel,
  liveText,
}: {
  card: RefObject<HTMLElement | null>;
  example: ExampleLine[] | null;
  name: string;
  lang: Language;
  phase: CallPhase;
  blocked: boolean;
  startLabel: string;
  /** The sentence of a live call: the seller's own or the standard one (liveTextOf). */
  liveText: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const idle = phase === "idle";

  // the example: on while the card is on screen, the tab is visible and nobody calls
  useEffect(() => {
    const el = root.current;
    const cardEl = card.current;
    if (!el || !cardEl || !example || !idle) return;
    const engine = createExampleCall(el, cardEl);
    const reduced = window.matchMedia?.(REDUCED);
    let inView = false;
    const update = () => {
      if (reduced?.matches) {
        engine.stop();
        engine.showStatic();
        return;
      }
      engine.update(inView && !document.hidden);
    };
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.3);
      update();
    }, { threshold: [0, 0.3, 0.6] });
    io.observe(cardEl);
    document.addEventListener("visibilitychange", update);
    reduced?.addEventListener?.("change", update);
    update();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced?.removeEventListener?.("change", update);
      engine.stop();
    };
  }, [card, example, idle]);

  // the running time of a live call
  const live = phase === "live";
  useEffect(() => {
    if (!live) return;
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      window.clearInterval(timer);
      setSeconds(0);
    };
  }, [live]);

  if (!example && idle) return null;

  const label =
    phase === "connecting" ? ui("agent.label.calling", lang) : phase === "live" ? ui("agent.label.live", lang) : phase === "dropped" ? ui("agent.label.dropped", lang) : phase === "failed" ? ui("agent.label.failed", lang) : ui("agent.example", lang);
  const status =
    phase === "connecting"
      ? uiFmt("agent.status.connecting", lang, { name })
      : phase === "live"
        ? liveText
        : phase === "dropped"
          ? uiFmt("agent.status.dropped", lang, { label: startLabel })
          : phase === "failed"
            ? uiFmt(blocked ? "agent.status.blocked" : "agent.status.failed", lang, { label: startLabel })
            : "";

  return (
    <div ref={root} className="avatar-card__captions" data-depth="40" data-phase={phase}>
      <p className="avatar-card__cap-head" data-cap-head>
        <span className="avatar-card__bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>{label}</span>
        {live && <span className="avatar-card__timer">{fmt(seconds)}</span>}
      </p>
      {example && idle && (
        <ol className="avatar-card__lines">
          {example.map((line, i) => (
            <li key={i} className="avatar-card__line" data-line data-who={line.speaker}>
              <span className="avatar-card__who">{line.speaker === "agent" ? name : ui("agent.caller", lang)}</span>
              <span className="avatar-card__text">
                {line.text.split(/[ \t\n\r]+/).filter(Boolean).map((word, k, all) => (
                  <span key={k}>
                    <span data-w>{word}</span>
                    {k < all.length - 1 ? " " : ""}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!idle && (
        <p className="avatar-card__status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
