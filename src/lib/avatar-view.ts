// How the avatar card decides what to show. Pure functions (no DOM), so every row of the degradation table is a unit test.
import { AVATAR_SLOTS, type AvatarSlot, type LoopFiles, type ResolvedAvatar } from "./avatar-manifest";
import type { CardState } from "./agent-state";
import { languageEntry, type Language } from "./languages";
import { pick } from "./i18n";
import { ui, uiFmt } from "./ui-strings";

/** The loops the pack has, in stacking order. */
export const loopSlots = (avatar: ResolvedAvatar): AvatarSlot[] => AVATAR_SLOTS.filter((slot) => avatar[slot] !== null);

/**
 * The loop to show for a state, or null for the poster. The degradation table:
 *  - poster only: always the poster.
 *  - one loop: that loop plays in every state (no switching).
 *  - waiting (idle): the invite loop; without one the idle loop; without that the poster.
 *  - a call: the listen loop; without one the idle loop, then the invite loop.
 *  - speaking: the speak loop; without one the listen loop, then idle, then invite (no speaking state: the call picture stays).
 * After a call the state is idle again, so the invite loop comes back.
 */
export function activeSlot(avatar: ResolvedAvatar, state: CardState): AvatarSlot | null {
  const slots = loopSlots(avatar);
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];
  const first = (...order: AvatarSlot[]): AvatarSlot | null => order.find((slot) => avatar[slot] !== null) ?? null;
  if (state === "idle") return first("invite", "idle");
  if (state === "call") return first("listen", "idle", "invite");
  return first("speak", "listen", "idle", "invite");
}

/** A pack with a single loop does not switch, so that loop is loaded like the idle one, without waiting for a touch. */
export const isSingleLoop = (avatar: ResolvedAvatar): boolean => loopSlots(avatar).length === 1;

/**
 * Which loops may be mounted (and so loaded) now. The invite loop, the idle loop and a pack's only loop after the page is idle; the listen
 * and speak loops once the visitor touches the card (pointer, focus) or a call has started. The idle loop is only the fallback of a pack
 * that has an invite loop: it is mounted then only when the pack has no listen loop for the call to use. Nothing without motion.
 */
export function slotsToMount(avatar: ResolvedAvatar, { motion, pageIdle, touched }: { motion: boolean; pageIdle: boolean; touched: boolean }): AvatarSlot[] {
  if (!motion) return [];
  const single = isSingleLoop(avatar);
  return loopSlots(avatar).filter((slot) => {
    if (single || slot === "invite") return pageIdle;
    if (slot === "idle") return pageIdle && (avatar.invite === null || avatar.listen === null);
    return touched;
  });
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

/**
 * The line under the name on the card: the seller's role in the page language, then the own names of the languages the seller offers
 * ("Verkaufsberaterin · Deutsch, English"; with `codes` the languages are their codes, "Verkaufsberaterin · DE, EN", for a card too narrow for one line). Without a role it is the languages only; with neither it is empty (no line).
 */
export function roleLine(avatar: Pick<ResolvedAvatar, "role" | "languages">, lang: Language, codes = false): string {
  const role = avatar.role ? pick(avatar.role, lang) : "";
  const names = avatar.languages.map((l) => (codes ? l.toUpperCase() : languageEntry(l).name)).join(", ");
  return [role, names].filter(Boolean).join(" \u00b7 ");
}

/** The start button's text: the seller's own (agent.avatar.startLabel) or "Talk to {name} now" in the page language. */
export const startLabelOf = (avatar: Pick<ResolvedAvatar, "name" | "startLabel">, lang: Language): string =>
  avatar.startLabel ? pick(avatar.startLabel, lang) : uiFmt("agent.talk", lang, { name: avatar.name });

/** The bubble's text: the seller's own (agent.avatar.bubble) or "Call me" / "Rufen Sie mich an" in the page language. */
export const bubbleTextOf = (avatar: Pick<ResolvedAvatar, "bubble">, lang: Language): string => (avatar.bubble ? pick(avatar.bubble, lang) : ui("agent.bubble", lang));

/** The sentence under "Live call" while a call runs: the seller's own (agent.avatar.liveText) or "You are live with {name}." in the page language; {name} is the agent's name. */
export const liveTextOf = (avatar: Pick<ResolvedAvatar, "liveText" | "name">, lang: Language): string =>
  avatar.liveText ? pick(avatar.liveText, lang).replaceAll("{name}", avatar.name) : uiFmt("agent.status.live", lang, { name: avatar.name });

/** Whether the card has a bubble at all: an invite loop with a cue (no cue, or no invite loop, means none). */
export const hasBubble = (avatar: Pick<ResolvedAvatar, "invite" | "inviteCue">): boolean => avatar.invite !== null && avatar.inviteCue !== null;
