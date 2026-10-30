// When the call bubble is up. Pure functions (no DOM), ported from the Hanc home hero (components/v3/home/HeroStage.astro, "Call me."):
// the bubble follows the invite loop's own clock, so it comes up when the person's lips move and goes before the loop restarts. Hanc
// measured its cue (up from 2.8 s, gone at 4.8 s of a 5.04 s loop) on that one clip; ours comes from the pack (avatar.json, invite.cue).
// The typing is Hanc's too (its script: SAY_IN, SAY_MID, SAY_BACK, SAY_DONE, sayCut, part, lettersAt), see docs/reference/HANC-HERO-CARD.md.
import type { InviteCue } from "./avatar-manifest";

/** True from `cue.show` up to (not including) `cue.hide`, in seconds of the loop's own playback time. It repeats with the loop. */
export const bubbleOn = (time: number, cue: InviteCue): boolean => time >= cue.show && time < cue.hide;

export type BubbleInput = {
  /** The pack's invite loop has a cue. */
  cue: InviteCue | null;
  /** The invite loop is the one on screen and is playing (not paused, not a poster, not under reduced motion). */
  playing: boolean;
  /** A call is connecting, live or has failed: the bubble steps aside (the invitation has been taken). */
  callBusy: boolean;
  /** The widget's full-screen form is open over the card. */
  overlay: boolean;
};

/** Whether the bubble may be up at all; if it may, `bubbleOn` of the video's time decides. */
export const bubbleAllowed = (i: BubbleInput): boolean => i.cue !== null && i.playing && !i.callBusy && !i.overlay;

/**
 * Hanc types its line in two stretches, measured on its clip (lips: "Call", closed, "me"): 2.8 to 3.25 s, a pause to 3.35 s, 3.35 to 3.75 s, with the bubble
 * up from 2.8 s. These are those stretches as offsets from the moment the bubble comes up (0, 0.45, 0.55 and 0.95 s); only the start moves to our cue.show.
 */
export const TYPE_MID = 0.45;
export const TYPE_BACK = 0.55;
export const TYPE_DONE = 0.95;

/** Hanc's `sayCut`: the line is cut at the space nearest to 65% of its length (it types the first part, pauses, types the rest); no space: the rounded 65%. */
export const typeCut = (line: string): number => {
  const want = line.length * 0.65;
  let best = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === " " && (best < 0 || Math.abs(i + 1 - want) < Math.abs(best - want))) best = i + 1;
  }
  return best < 0 ? Math.round(want) : best;
};

/** Hanc's `part`: how far `time` is from `from` to `to`, 0 to 1. */
const part = (time: number, from: number, to: number): number => Math.max(0, Math.min(1, (time - from) / (to - from)));

/** Hanc's `lettersAt`: how many letters of `line` are typed at `time` (the loop's own time). Linear, whole letters (rounded up), none before `cue.show`, all from `cue.show + TYPE_DONE`. */
export const lettersAt = (time: number, cue: InviteCue, line: string): number => {
  const cut = typeCut(line);
  const [mid, back, done] = [cue.show + TYPE_MID, cue.show + TYPE_BACK, cue.show + TYPE_DONE];
  return time < back ? Math.ceil(part(time, cue.show, mid) * cut) : cut + Math.ceil(part(time, back, done) * (line.length - cut));
};
