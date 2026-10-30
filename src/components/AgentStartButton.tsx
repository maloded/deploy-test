"use client";

import { useEffect, useRef, useState } from "react";
import { pick } from "@/lib/i18n";
import { ui, uiFmt } from "@/lib/ui-strings";
import type { Language } from "@/lib/languages";
import type { Localized } from "@/lib/schema";
import type { ButtonIcon } from "@/lib/avatar-manifest";
import { WheelIcon } from "./WheelIcon";
import { toggleCall, watchCallStatus, whenWidgetReady, type CallStatus, type WidgetHost } from "@/lib/hanc-bridge";

/**
 * The start / end button of the avatar card: our own, in the theme's colours, in place of the widget's pill. The real widget stays
 * mounted (hidden by CSS, see .avatar-card in globals.css) and does the call: a click here is a click on the widget's own button
 * (src/lib/hanc-bridge.ts), so its consent check, sounds and states run as for any visitor. Nothing here accepts a consent.
 *
 * data-mode: "pending" until the widget has rendered its button, "custom" when it has, "standard" when it has not (another version
 * of the package, or no button): then this button hides itself and the widget's own pill shows (the CSS keys on the attribute).
 * data-state: idle, connecting, connected (a call is running) or error. The wheel icon turns while data-state is "connected", nothing else.
 */
type Mode = "pending" | "custom" | "standard";

export function AgentStartButton({ host, lang, name, startLabel, endLabel, icon = "orb" }: { host: WidgetHost | null; lang: Language; name?: string; startLabel: Localized | null; endLabel: Localized | null; icon?: ButtonIcon }) {
  const [mode, setMode] = useState<Mode>("pending");
  const [status, setStatus] = useState<CallStatus>("idle");

  useEffect(() => {
    if (!host) return;
    let live = true;
    void whenWidgetReady(host).then((ready) => live && setMode(ready ? "custom" : "standard"));
    const stop = watchCallStatus(host, (next) => live && setStatus(next));
    return () => {
      live = false;
      stop();
    };
  }, [host]);

  const label =
    status === "connecting" ? ui("agent.connecting", lang) : status === "connected" ? (endLabel ? pick(endLabel, lang) : ui("agent.end", lang)) : status === "error" ? ui("agent.error", lang) : startLabel ? pick(startLabel, lang) : name ? uiFmt("agent.talk", lang, { name }) : ui("agent.start", lang);
  const disabled = mode !== "custom" || status === "connecting";

  const onClick = () => {
    if (!host || disabled) return;
    if (!toggleCall(host)) setMode("standard"); // neither the button nor the toggle: the widget's own pill takes over
  };

  // the orb's label slides out to the text's own width: measure it (and again when the font arrives) into --call-orb-w on the button
  const orbButton = useRef<HTMLButtonElement>(null);
  const orbText = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const button = orbButton.current;
    const text = orbText.current;
    if (!button || !text) return;
    // one pixel of air: the width is rounded down, and the label must never lose its last letter
    const measure = () => button.style.setProperty("--call-orb-w", `${text.scrollWidth + 1}px`);
    measure();
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener?.("loadingdone", measure); // a font that arrives after first paint
    button.addEventListener("pointerenter", measure);
    button.addEventListener("focus", measure);
    return () => {
      document.fonts?.removeEventListener?.("loadingdone", measure);
      button.removeEventListener("pointerenter", measure);
      button.removeEventListener("focus", measure);
    };
  }, [label, icon]);

  if (icon === "orb") {
    return (
      <>
        {/* Hanc's call button, drawn by us (the widget stays hidden): the orb with its rings, and on it the pill with the dark disc */}
        <span className="call-orb" data-state={status}>
          <span className="call-orb__glow" aria-hidden="true">
            <span className="call-orb__swirl" />
          </span>
          <span className="call-orb__rings" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <button ref={orbButton} type="button" className="avatar-card__start call-orb__btn" data-mode={mode} data-state={status} data-icon="orb" aria-disabled={disabled || undefined} aria-busy={status === "connecting" || undefined} onClick={onClick}>
            <span className="call-orb__icon" aria-hidden="true">
              <OrbIcon status={status} />
            </span>
            <span className="call-orb__label">
              <span ref={orbText} className="call-orb__text">{label}</span>
            </span>
          </button>
        </span>
        {/* outside the button, so the button's own name stays its label; says what changed to a screen reader */}
        <span className="sr-only" role="status">
          {status === "idle" ? "" : label}
        </span>
      </>
    );
  }
  return (
    <>
      <button type="button" className="avatar-card__start" data-mode={mode} data-state={status} data-icon={icon} aria-disabled={disabled || undefined} aria-busy={status === "connecting" || undefined} onClick={onClick}>
        {icon === "wheel" ? <WheelIcon /> : <span className="avatar-card__start-dot" aria-hidden="true" />}
        <span>{label}</span>
      </button>
      {/* outside the button, so the button's own name stays its label; says what changed to a screen reader */}
      <span className="sr-only" role="status">
        {status === "idle" ? "" : label}
      </span>
    </>
  );
}

/**
 * The icon of Hanc's call button in each state (the same three drawings as the widget's own button): the four level bars while it
 * waits, a spinner while it connects, a handset with a slash during a call (it hangs up). All white on the dark disc.
 */
function OrbIcon({ status }: { status: CallStatus }) {
  if (status === "connecting") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="call-orb__spinner" focusable="false">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="30 10" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "connected") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" focusable="false">
        <path
          d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="22" x2="2" y1="2" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="18" viewBox="0 0 328 369" fill="none" focusable="false">
      <rect x="110.323" y="104.507" width="46.3995" height="161.276" rx="23.1997" fill="currentColor" />
      <rect x="280.697" y="59.3491" width="46.3995" height="238.689" rx="23.1997" fill="currentColor" />
      <rect x="196.153" width="45.1106" height="369" rx="22.5553" fill="currentColor" />
      <ellipse cx="35.4441" cy="178.694" rx="35.4441" ry="35.4808" fill="currentColor" />
    </svg>
  );
}
