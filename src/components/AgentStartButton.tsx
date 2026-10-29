"use client";

import { useEffect, useState } from "react";
import { pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
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

export function AgentStartButton({ host, lang, startLabel, endLabel, icon = "dot" }: { host: WidgetHost | null; lang: Language; startLabel: Localized | null; endLabel: Localized | null; icon?: ButtonIcon }) {
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
    status === "connecting" ? ui("agent.connecting", lang) : status === "connected" ? (endLabel ? pick(endLabel, lang) : ui("agent.end", lang)) : status === "error" ? ui("agent.error", lang) : startLabel ? pick(startLabel, lang) : ui("agent.start", lang);
  const disabled = mode !== "custom" || status === "connecting";

  const onClick = () => {
    if (!host || disabled) return;
    if (!toggleCall(host)) setMode("standard"); // neither the button nor the toggle: the widget's own pill takes over
  };

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
