// A short linear volume ramp on an audio element. Steps on a timer (not rAF: it must also run in a tab that is going to the
// background), so a test with fake timers drives it exactly.
import { FADE_MS } from "./music";

export const FADE_STEP_MS = 20;

type Volume = { volume: number };

/**
 * Moves `audio.volume` from where it is to `to` over `ms` and then calls `done`. Returns a function that stops the ramp where it is
 * (without calling `done`). With no distance to go, or no time, it finishes at once.
 */
export function fadeVolume(audio: Volume, to: number, ms: number = FADE_MS, done?: () => void): () => void {
  const target = Math.min(1, Math.max(0, to));
  const from = audio.volume;
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  if (from === target || ms <= 0) {
    audio.volume = target;
    done?.();
    return () => {};
  }
  let n = 0;
  const timer = setInterval(() => {
    n++;
    audio.volume = n >= steps ? target : from + ((target - from) * n) / steps;
    if (n >= steps) {
      clearInterval(timer);
      done?.();
    }
  }, FADE_STEP_MS);
  return () => clearInterval(timer);
}
