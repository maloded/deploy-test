"use client";

import { useEffect, useState, type RefObject } from "react";
import { agentStateOf, nextCardState, type CardState } from "@/lib/agent-state";
import { findWidget, watchAgentSpeech, type WidgetHost } from "@/lib/hanc-bridge";

/**
 * The avatar card's state. Primary source: what the agent is doing in the call (idle, listening, speaking), read through the bridge
 * from the widget inside `card`. Secondary: "call-start", "call-end" and "agent-command" (agent_state) on the document. The
 * listeners only read: they never call preventDefault() or respond(), so the agent bridge answers its own commands as before.
 * The widget is `host` when the caller has it (it appears after the package has loaded), else the one found inside `card`; without
 * either only the document signals are used.
 */
export function useAgentState(card?: RefObject<HTMLElement | null>, host?: WidgetHost | null): CardState {
  const [state, setState] = useState<CardState>("idle");
  useEffect(() => {
    const onStart = () => setState((s) => nextCardState(s, { kind: "call-start" }));
    const onEnd = () => setState((s) => nextCardState(s, { kind: "call-end" }));
    const onCommand = (event: Event) => {
      const value = agentStateOf((event as CustomEvent).detail);
      if (value !== null) setState((s) => nextCardState(s, { kind: "agent-state", state: value }));
    };
    document.addEventListener("call-start", onStart);
    document.addEventListener("call-end", onEnd);
    document.addEventListener("agent-command", onCommand);
    const widget = host ?? (card?.current ? findWidget(card.current) : null);
    const stopWatching = widget ? watchAgentSpeech(widget, (speech) => setState((s) => nextCardState(s, { kind: "speech", state: speech }))) : undefined;
    return () => {
      stopWatching?.();
      document.removeEventListener("call-start", onStart);
      document.removeEventListener("call-end", onEnd);
      document.removeEventListener("agent-command", onCommand);
    };
  }, [card, host]);
  return state;
}
