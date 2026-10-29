// How the avatar card decides what to show. Pure functions (no DOM), so every row of the degradation table is a unit test.
import { AVATAR_SLOTS, type AvatarSlot, type LoopFiles, type ResolvedAvatar } from "./avatar-manifest";
import type { CardState } from "./agent-state";

/** The loops the pack has, in stacking order. */
export const loopSlots = (avatar: ResolvedAvatar): AvatarSlot[] => AVATAR_SLOTS.filter((slot) => avatar[slot] !== null);

/**
 * The loop to show for a state, or null for the poster. The degradation table:
 *  - poster only: always the poster.
 *  - one loop: that loop plays in every state (no switching).
 *  - idle missing: the poster while waiting.
 *  - listen missing: the idle loop during a call, if the pack has one.
 *  - speak missing: no speaking state, the call picture stays.
 */
export function activeSlot(avatar: ResolvedAvatar, state: CardState): AvatarSlot | null {
  const slots = loopSlots(avatar);
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];
  const has = (slot: AvatarSlot) => avatar[slot] !== null;
  if (state === "idle") return has("idle") ? "idle" : null;
  if (state === "call") return has("listen") ? "listen" : has("idle") ? "idle" : null;
  return has("speak") ? "speak" : has("listen") ? "listen" : has("idle") ? "idle" : null;
}

/** A pack with a single loop does not switch, so that loop is loaded like the idle one, without waiting for a touch. */
export const isSingleLoop = (avatar: ResolvedAvatar): boolean => loopSlots(avatar).length === 1;

/**
 * Which loops may be mounted (and so loaded) now. The idle loop, and a pack's only loop, after the page is idle; the listen and speak
 * loops once the visitor touches the card (pointer, focus) or a call has started. Nothing without motion.
 */
export function slotsToMount(avatar: ResolvedAvatar, { motion, pageIdle, touched }: { motion: boolean; pageIdle: boolean; touched: boolean }): AvatarSlot[] {
  if (!motion) return [];
  const single = isSingleLoop(avatar);
  return loopSlots(avatar).filter((slot) => (single || slot === "idle" ? pageIdle : touched));
}

/**
 * The one file to load for a loop: WebM when the browser can play VP9 in it and the pack has it, otherwise MP4. Never both.
 * null when the browser cannot play what the pack has (the card keeps the poster).
 */
export function pickFormat(loop: LoopFiles, canWebm: boolean): string | null {
  if (loop.webm && canWebm) return loop.webm;
  return loop.mp4 ?? null;
}

/** Poster only for a visitor who asked for less motion or less data. */
export const motionAllowed = ({ reducedMotion, saveData }: { reducedMotion: boolean; saveData: boolean }): boolean => !reducedMotion && !saveData;
