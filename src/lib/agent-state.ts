// What the avatar card shows while the voice agent works, from the signals the widget puts on the document.
// Pure functions; the hook that listens is in components/use-agent-state.ts.
//
// Signals used (hanc-webrtc-widgets 2.11.0):
//  - the agent's own speech state (listening / speaking), read by src/lib/hanc-bridge.ts from the call's participant attributes:
//    the primary source. It arrives as { kind: "speech" }.
//  - "call-start" / "call-end": plain events of the widget element (bubbles, composed), documented in its README.
//  - "agent-command" with type "agent_state" and payload.state "idle" | "listening" | "thinking" | "speaking": typed in the
//    package (AgentCommand), forwarded to the document by the widget. Whether the platform actually SENDS agent_state is
//    unconfirmed. Without it the card stays on the listening picture for the whole call, and nothing else breaks.

/** idle: no call (idle loop). call: a call is running (listen loop). speaking: the agent speaks (speak loop). */
export type CardState = "idle" | "call" | "speaking";

export type AgentSignal = { kind: "call-start" } | { kind: "call-end" } | { kind: "agent-state"; state: string } | { kind: "speech"; state: "idle" | "listening" | "speaking" };

/**
 * The next card state. An agent_state outside a call is ignored (a late message after call-end must not wake the card),
 * and so is a value we do not know.
 */
export function nextCardState(state: CardState, signal: AgentSignal): CardState {
  if (signal.kind === "call-start") return "call";
  if (signal.kind === "call-end") return "idle";
  // the bridge's speech state is the call itself: listening means a call is running (even if the bridge heard of it first), idle that it ended
  if (signal.kind === "speech") return signal.state === "idle" ? "idle" : signal.state === "speaking" ? "speaking" : "call";
  if (state === "idle") return "idle";
  if (signal.state === "speaking") return "speaking";
  if (signal.state === "idle" || signal.state === "listening" || signal.state === "thinking") return "call";
  return state;
}

/** The agent_state value in an agent-command event's detail, or null when the command is anything else. */
export function agentStateOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const { type, payload } = detail as { type?: unknown; payload?: { state?: unknown } | null };
  if (type !== "agent_state") return null;
  return typeof payload?.state === "string" ? payload.state : null;
}
