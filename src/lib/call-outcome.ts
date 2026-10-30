// What a call attempt came to, for the line on the card. Pure functions (no DOM), ported from the Hanc role hero (RoleHero.astro, "Call state"):
// the widget reports idle, connecting, connected and error; on top of that the page remembers whether the attempt ever connected. An attempt
// that falls back to idle or error without connecting FAILED; an error after a connection is a DROPPED call; idle after a connection is an
// ordinary end. A failure stays up until the next attempt starts, even when the widget resets itself underneath.
import type { CallStatus } from "./hanc-bridge";

export type CallPhase = "idle" | "connecting" | "live" | "failed" | "dropped";
export type Outcome = { phase: CallPhase; connected: boolean };

export const NO_CALL: Outcome = { phase: "idle", connected: false };

export function nextOutcome(o: Outcome, status: CallStatus): Outcome {
  switch (status) {
    case "connecting":
      return { phase: "connecting", connected: false };
    case "connected":
      return { phase: "live", connected: true };
    case "error":
      return { phase: o.connected ? "dropped" : "failed", connected: false };
    case "idle":
      if (o.phase === "connecting") return { phase: "failed", connected: false }; // asked, never connected
      if (o.phase === "failed" || o.phase === "dropped") return o; // stays until the next attempt
      return NO_CALL; // idle, or a call that ended
  }
}

/** The value of `data-call` on the card: what the ring and the transcript key on. */
export const callAttribute = (phase: CallPhase): "idle" | "connecting" | "connected" | "error" =>
  phase === "live" ? "connected" : phase === "failed" || phase === "dropped" ? "error" : phase;
