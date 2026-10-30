"use client";

import { useEffect, useState } from "react";
import type { CallStatus } from "@/lib/hanc-bridge";
import { NO_CALL, nextOutcome, type CallPhase, type Outcome } from "@/lib/call-outcome";

/**
 * The phase of the call attempt (see lib/call-outcome.ts) from the widget's status, and for a failed attempt whether the browser blocked the
 * microphone (the Permissions API; without it the general reason is kept).
 */
export function useCallOutcome(status: CallStatus): { phase: CallPhase; blocked: boolean } {
  const [outcome, setOutcome] = useState<Outcome>(NO_CALL);
  const [seen, setSeen] = useState<CallStatus>(status);
  const [blocked, setBlocked] = useState(false);
  if (seen !== status) {
    // each change of the status is one step of the machine (state adjusted while rendering, not in an effect)
    setSeen(status);
    setOutcome(nextOutcome(outcome, status));
  }
  const failed = outcome.phase === "failed";
  useEffect(() => {
    if (!failed) return;
    let live = true;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => live && setBlocked(p.state === "denied"))
      .catch(() => {});
    return () => {
      live = false;
      setBlocked(false);
    };
  }, [failed]);
  return { phase: outcome.phase, blocked };
}
