"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { CARD_FLIGHT } from "@/lib/card-flight";
import { createFlightController, type FlightController } from "./card-flight-controller";

export type Placement = "hero" | "dock";

/**
 * Where the card is: "hero" (laid over the slot of the hero, which the hero reserves with [data-agent-slot]) or "dock" (the small card
 * fixed in the corner). The switch is instant and reversible, and the card is ONE element for the whole page life: only the attribute and
 * its custom properties change, so nothing is remounted, a running call goes on and the videos do not restart.
 *
 * - `formOpen` (the widget's form is open over the card) ends a flight in the air at once and makes the next switch instant: the form is never covered
 *   by a ghost. A call in any phase (connecting, live, ended) does not stop the flight: the ghost never touches the widget, and it draws the loop on screen.
 * - The hero's slot is watched by an IntersectionObserver with the thresholds 0 and CARD_FLIGHT.trigger (0.28): the card is in the hero while at
 *   least that share of the slot is on screen, and docks below it, with a flight of a ghost (card-flight-controller.ts); the same share brings it
 *   back. The first measurement places it without a flight.
 * - In the hero the card is `position: absolute` in document coordinates over the slot (CSS: .avatar-card[data-placement="hero"]), so it
 *   scrolls with the page without any script (no scroll-linked jitter). The coordinates come from the slot's box and are measured again
 *   when the slot, the hero or the page change size, and on window resize and font load, never on scroll: --avatar-slot-x, --avatar-slot-y
 *   and --avatar-slot-w on the card. This needs .pt, body and html to stay `position: static` (a test checks it).
 * - The hero's row (title zone + slot) hands its height to the CSS as --hero-slot-h, so the slot's column is exactly as wide as a 4:5 card
 *   as tall as the left column (0.8 x the height, at most 36rem and 44vw) and the card ends at the right edge of the container.
 * - Until the first measurement the card is hidden (data-ready="false"), so it never flashes in the corner before it moves to the slot.
 * - `expectSlot` is what the server knows (the hero block is on the page). Without a slot in the DOM the card stays docked. `fixed` pins
 *   the placement and skips all of this.
 */
export function useCardPlacement(card: RefObject<HTMLElement | null>, expectSlot: boolean, fixed?: Placement, formOpen = false): { placement: Placement; ready: boolean } {
  const [placement, setPlacement] = useState<Placement>(fixed ?? (expectSlot ? "hero" : "dock"));
  const [ready, setReady] = useState(fixed !== undefined || !expectSlot);
  // formOpen: the widget's form is open over the card. The card is then shown as it is at once (no ghost in the air, none starts).
  const formNow = useRef(formOpen);
  const flying = useRef<FlightController | null>(null);
  useEffect(() => {
    formNow.current = formOpen;
    if (formOpen) flying.current?.finish();
  }, [formOpen]);

  useEffect(() => {
    const el = card.current;
    if (!el || fixed !== undefined || !expectSlot) return;
    const slot = document.querySelector<HTMLElement>("[data-agent-slot]");
    const hero = document.getElementById("hero");
    let raf = 0;
    if (!slot || !hero || typeof IntersectionObserver === "undefined") {
      raf = requestAnimationFrame(() => {
        setPlacement("dock");
        setReady(true);
      });
      return () => cancelAnimationFrame(raf);
    }

    // the row's height is what a 4:5 card as tall as the left column needs its width from (0.8 x it): the CSS takes it from --hero-slot-h
    const row = slot.parentElement;
    let rebuildGate = () => {};
    const measure = () => {
      rebuildGate();
      row?.style.setProperty("--hero-slot-h", `${row.getBoundingClientRect().height}px`);
      const r = slot.getBoundingClientRect();
      el.style.setProperty("--avatar-slot-x", `${r.left + window.scrollX}px`);
      el.style.setProperty("--avatar-slot-y", `${r.top + window.scrollY}px`);
      el.style.setProperty("--avatar-slot-w", `${r.width}px`);
    };
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    // The card leaves when the slot is CARD_FLIGHT.trigger visible or less (scrolling down) and comes back at the same share (scrolling up). The switch is
    // instant for the real card; what the visitor sees is the flight of a ghost over it (card-flight-controller.ts), or nothing under reduced motion.
    // The gate: while a block of the hero's content (CARD_FLIGHT.keepClear) is where the dock would be, the card does not land on it but waits in the
    // hero, unless the slot is fully off the screen: then it docks regardless (and enters from above), so it can never stay in the hero for good.
    const flight = createFlightController({ card: el, slot, setPlacement });
    flying.current = flight;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let first = true;
    let current: Placement = "hero";
    let ratio = 1;
    const under = new Set<Element>(); // the blocks of the hero that are in the dock's place now
    const wanted = (): Placement => {
      if (ratio >= CARD_FLIGHT.trigger) return "hero";
      if (ratio === 0 || under.size === 0) return "dock";
      return current; // under the trigger but something would be covered: stay as it is
    };
    const evaluate = () => {
      const want = wanted();
      if (first) {
        first = false;
        current = want;
        setPlacement(want);
        measure();
        setReady(true);
        return;
      }
      if (want === current) return;
      current = want;
      if (reduced?.matches || formNow.current) {
        flight.finish();
        setPlacement(want);
      } else flight.start(want);
    };
    const io = new IntersectionObserver(
      (entries) => {
        ratio = entries[entries.length - 1].intersectionRatio;
        evaluate();
      },
      { threshold: [0, CARD_FLIGHT.trigger] },
    );
    io.observe(slot);

    // The dock's place is read from an empty .avatar-card in the dock placement (so the CSS, the phone's circle included, says where it is), and the
    // observer's root is shrunk to that place: a block is "under" the dock exactly while it intersects the root.
    let gate: IntersectionObserver | null = null;
    const blocks = CARD_FLIGHT.keepClear.flatMap((q) => Array.from(hero.querySelectorAll(q)));
    rebuildGate = () => {
      gate?.disconnect();
      gate = null;
      under.clear();
      if (!blocks.length || typeof IntersectionObserver === "undefined") return;
      const probe = document.createElement("div");
      probe.className = "avatar-card";
      probe.dataset.placement = "dock";
      if (el.dataset.icon) probe.dataset.icon = el.dataset.icon;
      probe.setAttribute("aria-hidden", "true");
      probe.style.visibility = "hidden";
      document.body.appendChild(probe);
      const z = probe.getBoundingClientRect();
      probe.remove();
      if (z.width <= 0 || z.height <= 0) return;
      const c = CARD_FLIGHT.clearance;
      const inset = [z.top - c, document.documentElement.clientWidth - z.right - c, window.innerHeight - z.bottom - c, z.left - c].map((n) => Math.max(0, Math.round(n)));
      gate = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) under.add(e.target);
            else under.delete(e.target);
          }
          if (!first) evaluate();
        },
        { rootMargin: inset.map((n) => `-${n}px`).join(" ") },
      );
      for (const b of blocks) gate.observe(b);
    };
    rebuildGate();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(later);
    ro?.observe(slot);
    if (row) ro?.observe(row);
    ro?.observe(hero);
    ro?.observe(document.body);
    window.addEventListener("resize", later);
    void document.fonts?.ready.then(later);
    return () => {
      flight.finish();
      flying.current = null;
      cancelAnimationFrame(raf);
      io.disconnect();
      gate?.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", later);
    };
  }, [card, expectSlot, fixed]);

  return { placement, ready };
}
