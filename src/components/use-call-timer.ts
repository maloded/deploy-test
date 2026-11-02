"use client";

import { useEffect, useState } from "react";

/**
 * Seconds since `running` became true (0 while it is false): the timer of a live call. It counts from the moment the call is live and stops, back at 0, when
 * the call ends. Checked every 250 ms, so the second changes close to when it should whatever the timer's phase.
 */
export function useCallTimer(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => {
      window.clearInterval(timer);
      setSeconds(0); // the call is over: the next one starts at 0, not at what this one reached
    };
  }, [running]);
  return running ? seconds : 0;
}
