import { flushSync } from "react-dom";
import { BAR_QUERY } from "@/lib/call-bar";
import { fadeEnd, type Dir, type Shape } from "@/lib/bar-morph";
import { CARD_FLIGHT, type Rect } from "@/lib/card-flight";
import { addCardParts, createMorph, dropMorph, flyMorph, followMorph, holdBar, releaseBar, type Morph, type MorphGoal, type MorphState } from "./bar-morph";
import { aimOrb, createGhost, dropGhost, flyGhost, followGhost, frameRadius, orbNow, orbRelOf, rectOf, type Ghost } from "./card-ghost";
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
  let morph: Morph | null = null; // the card turning into the call bar and back (phones), see bar-morph.ts
  const isNarrow = () => Boolean(window.matchMedia?.(BAR_QUERY).matches); // read when needed: the window may have been resized

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
    if (morph) {
      releaseBar(morph.bar);
      dropMorph(morph, false);
      morph = null;
    }
  };

  // ---- the phone: the card morphs into the call bar and back ----
  const barOf = () => card.querySelector<HTMLElement>(".avatar-card__bar");
  /** The bar, where it is drawn: below 900px, with a bar in the card. */
  const phoneBar = (): HTMLElement | null => (isNarrow() ? barOf() : null);
  /** While the idle bar steps aside over the offer or the footer there is nothing to morph into: the switch is instant. */
  const barAside = () => card.dataset.barZone === "off" && card.dataset.call === "idle";
  const barRadius = (bar: HTMLElement, box: Rect) => Math.min(parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 0, box.height / 2);
  const toRect = (r: Rect, radius: number): Shape => ({ ...r, radius });
  const rel = (inner: Rect, outer: Rect): Rect => ({ left: inner.left - outer.left, top: inner.top - outer.top, width: inner.width, height: inner.height });
  const onto = (r: Rect, at: Rect): Rect => ({ left: at.left + r.left, top: at.top + r.top, width: r.width, height: r.height });

  const startMorph = (want: Placement, bar: HTMLElement) => {
    const dir: Dir = want === "dock" ? "toBar" : "toCard";
    const size = { w: slot.getBoundingClientRect().width, h: slot.getBoundingClientRect().width * 1.25 };
    let m = morph;
    let from: MorphState | undefined;
    let liveFrom: (() => MorphState) | undefined;
    const cardAction = () => card.querySelector<HTMLElement>(".avatar-card__action");
    if (m) {
      stop?.(); // taken over in the air: the ghost goes on from where it is, in the other direction
      from = m.cur;
    } else if (dir === "toBar") {
      // from the card in its place (the slot, which the page is still moving: followed live) to the bar
      const here = rectOf(card);
      const action = cardAction();
      const actionRel = action ? rel(rectOf(action), here) : null;
      const fromShape = (): Shape => {
        const r = slotRect();
        return toRect(r, frameRadius(card) ?? 0);
      };
      liveFrom = () => {
        const r = slotRect();
        return { shape: fromShape(), pic: r, picClip: fromShape(), orb: actionRel ? onto(actionRel, r) : r };
      };
      from = liveFrom();
      const orbSource = card.querySelector<HTMLElement>(".avatar-card__action .call-orb");
      m = createMorph({ dir, card, bar, barBox: rectOf(bar), size, start: from, fade: fadeEnd("toCard"), orbSource, orbRect: action ? rectOf(action) : null });
      addCardParts(m, card);
    } else {
      // from the bar to the card: the bar's face, text and button are where they are; the card's own parts are added once it has switched
      const barBox = rectOf(bar);
      const face = bar.querySelector<HTMLElement>(".avatar-card__face");
      const faceImg = bar.querySelector<HTMLElement>(".avatar-card__face-img");
      const button = bar.querySelector<HTMLElement>(".avatar-card__bar-button");
      const faceBox = face ? rectOf(face) : barBox;
      from = {
        shape: toRect(barBox, barRadius(bar, barBox)),
        pic: faceImg ? rectOf(faceImg) : faceBox,
        picClip: toRect(faceBox, faceBox.width / 2),
        orb: button ? rectOf(button) : barBox,
      };
      m = createMorph({ dir, card, bar, barBox, size, start: from, fade: fadeEnd("toBar"), orbSource: bar.querySelector<HTMLElement>(".avatar-card__bar-button .call-orb"), orbRect: button ? rectOf(button) : null });
    }
    morph = m;
    card.dataset.flight = want;
    holdBar(bar, m.fade); // nothing but the morph moves the bar's opacity and clip from here (the switch below would otherwise show or hide it by the stylesheet's own fade)
    flushSync(() => o.setPlacement(want));
    if (dir === "toCard" && !morph?.cardBox.firstChild) addCardParts(m, card); // the card is laid out in its place now, behind its hidden looks
    const barBox = rectOf(bar);
    m.barBox = barBox;
    let goal: MorphGoal;
    if (dir === "toBar") {
      const face = bar.querySelector<HTMLElement>(".avatar-card__face");
      const faceImg = bar.querySelector<HTMLElement>(".avatar-card__face-img");
      const button = bar.querySelector<HTMLElement>(".avatar-card__bar-button");
      const faceBox = face ? rectOf(face) : barBox;
      const picBox = faceImg ? rectOf(faceImg) : faceBox;
      const buttonBox = button ? rectOf(button) : barBox;
      const shape = toRect(barBox, barRadius(bar, barBox));
      goal = { shape: () => shape, pic: () => picBox, picClip: () => toRect(faceBox, faceBox.width / 2), orb: () => buttonBox };
    } else {
      const here = rectOf(card);
      const action = cardAction();
      const actionRel = action ? rel(rectOf(action), here) : null;
      const radius = frameRadius(card) ?? 0;
      goal = { shape: () => toRect(slotRect(), radius), pic: () => slotRect(), picClip: () => toRect(slotRect(), radius), orb: () => (actionRel ? onto(actionRel, slotRect()) : slotRect()) };
    }
    const land = () => {
      delete card.dataset.flight; // the real card (or the bar with its button) is shown; the ghost fades out over it
      const g = morph;
      if (!g) return;
      const unfollow = followMorph(g, goal, 200);
      stop = unfollow;
      releaseBar(g.bar);
      dropMorph(g, true);
      morph = null;
      window.setTimeout(unfollow, 260);
    };
    stop = flyMorph(m, dir, goal, land, liveFrom);
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
    const bar = phoneBar();
    if (bar && !barAside()) {
      startMorph(want, bar);
      return;
    }
    if (morph) finish(); // the bar went away (the window grew, or it steps aside): end the morph
    if (bar) {
      o.setPlacement(want); // the bar steps aside: nothing to morph into, instant
      return;
    }
    let from: () => Rect;
    let orbFrom = null as ReturnType<typeof orbNow>;
    if (ghost) {
      stop?.();
      const at = ghost.rect();
      orbFrom = orbNow(ghost); // the button's copy goes on from where it is
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
    aimOrb(ghost, orbFrom, orbRelOf(card)); // the button's place on the real card in its new placement: the copy flies there with the ghost
    const to = want === "dock" ? () => landed : slotRect;
    const toRadius = want === "dock" ? radiusIn(landed) : (frameRadius(card) ?? 0);
    stop = flyGhost(ghost, from, to, toRadius, () => land(to, toRadius));
  };

  return {
    start,
    get flying() {
      return ghost !== null || morph !== null;
    },
    finish,
  };
}
