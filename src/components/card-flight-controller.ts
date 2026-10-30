import { flushSync } from "react-dom";
import { CARD_FLIGHT, type Rect } from "@/lib/card-flight";
import { createGhost, dropGhost, flyGhost, followGhost, frameRadius, rectOf, type Ghost } from "./card-ghost";
import type { Placement } from "./use-card-placement";

export type FlightController = {
  /** Switches the card to `want` with a flight of the ghost; a flight on its way is taken over where the ghost is. */
  start: (want: Placement) => void;
  /** Whether a ghost is in the air. */
  readonly flying: boolean;
  /** Ends the flight now: the real card is shown (no fade) and the ghost is gone. */
  finish: () => void;
};

/**
 * The flight of the ghost between the hero's slot and the dock (see card-ghost.ts). The real card is one element for the page's whole life: it is
 * switched at once (`setPlacement`, flushed, so it can be measured in its new place) and carries data-flight until the ghost has landed, when it is
 * shown and the ghost fades out over it (CARD_FLIGHT.crossfadeMs).
 *
 * - Down (to the dock): from the slot's place, followed live while the page scrolls on; a slot already beyond the top edge starts just above it
 *   (CARD_FLIGHT.entryAbove card heights), on the right where the card is. To: the dock's place, measured after the switch.
 * - Up (to the hero): from the dock's place to the slot's, which is followed live.
 * - Switched again in the air: the ghost goes on from where it is, to the new place.
 * - The phone's circle (the docked orb card has no frame): the ghost's radius ends at half its side.
 */
export function createFlightController(o: { card: HTMLElement; slot: HTMLElement; setPlacement: (p: Placement) => void }): FlightController {
  const { card, slot } = o;
  let ghost: Ghost | null = null;
  let stop: (() => void) | null = null;

  const slotRect = (): Rect => {
    const r = rectOf(slot);
    return { ...r, top: Math.max(r.top, -r.height * CARD_FLIGHT.entryAbove) };
  };
  const radiusIn = (rect: Rect) => frameRadius(card) ?? Math.min(rect.width, rect.height) / 2;

  const finish = () => {
    stop?.();
    stop = null;
    delete card.dataset.flight;
    if (ghost) dropGhost(ghost, false);
    ghost = null;
  };
  const land = (getTo: () => Rect, toRadius: number) => {
    delete card.dataset.flight; // the real card is shown; the ghost fades out over it, staying on it while the page goes on scrolling
    if (!ghost) return;
    const g = ghost;
    const unfollow = followGhost(g, getTo, toRadius, CARD_FLIGHT.crossfadeMs);
    stop = unfollow;
    dropGhost(g, true);
    ghost = null; // from here on a new flight makes a new ghost; this one only fades
    window.setTimeout(unfollow, CARD_FLIGHT.crossfadeMs + 60);
  };

  const start = (want: Placement) => {
    let from: () => Rect;
    if (ghost) {
      stop?.();
      const at = ghost.rect();
      from = () => at;
      ghost.radius = parseFloat(ghost.el.style.borderRadius) || ghost.radius;
    } else {
      const here = rectOf(card);
      card.dataset.flight = want;
      ghost = createGhost(card, want === "dock" ? slotRect() : here, radiusIn(here), slot.getBoundingClientRect().width);
      from = want === "dock" ? slotRect : () => here;
    }
    card.dataset.flight = want;
    flushSync(() => o.setPlacement(want)); // the real card is in its new place, hidden, and can be measured
    const landed = rectOf(card);
    const to = want === "dock" ? () => landed : slotRect;
    const toRadius = want === "dock" ? radiusIn(landed) : (frameRadius(card) ?? 0);
    stop = flyGhost(ghost, from, to, toRadius, () => land(to, toRadius));
  };

  return {
    start,
    get flying() {
      return ghost !== null;
    },
    finish,
  };
}
