"use client";

import { useEffect, useState } from "react";
import { agentStateOf, nextCardState, type CardState } from "@/lib/agent-state";

/**
 * The avatar card's state, from "call-start", "call-end" and "agent-command" (agent_state) on the document. The listeners only
 * read: they never call preventDefault() or respond(), so the agent bridge answers its own commands as before.
 */
export function useAgentState(): CardState {
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
    return () => {
      document.removeEventListener("call-start", onStart);
      document.removeEventListener("call-end", onEnd);
      document.removeEventListener("agent-command", onCommand);
    };
  }, []);
  return state;
}
