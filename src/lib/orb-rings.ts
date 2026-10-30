// The waves around the orb of the start button, as the Hanc hero console plays them (HeroStage.astro initConsole + funnels/talk.css).
// Pure functions (no DOM), so every row is a unit test.
//
//   burst  the authored moment: three waves, once, 2.4 s after load, only if the button is untouched, on screen and the tab visible
//   idle   one soft wave every 7 s, after the burst has settled (2.8 s)
//   busy   steady waves while the call connects
//   off    during a call, and once the button has been used
//   away   the idle wave rests while the card is off screen (nobody to ring for)
import type { CallPhase } from "./call-outcome";

export type RingsState = "off" | "burst" | "idle" | "busy" | "away";

/** The delays of the authored moment, in ms (Hanc: 2400 and 2800). */
export const BURST_AFTER = 2400;
export const BURST_SETTLES = 2800;

export type RingsInput = {
  phase: CallPhase;
  /** The button was pressed, focused or tried at least once (a call attempt counts). */
  used: boolean;
  inView: boolean;
  /** The authored moment has played (or was skipped): from now on the rings rest or wave softly. */
  momentOver: boolean;
  /** The authored moment is playing right now. */
  bursting: boolean;
};

export function ringsState(i: RingsInput): RingsState {
  if (i.phase === "connecting") return "busy";
  if (i.phase === "live") return "off";
  if (i.used) return "off";
  if (i.bursting) return "burst";
  if (!i.momentOver) return "off";
  return i.inView ? "idle" : "away";
}
