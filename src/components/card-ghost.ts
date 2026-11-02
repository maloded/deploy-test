// The "ghost" of the avatar card. A light clone (one frame of the playing loop on a canvas, the
// shade and the ring; no widget, no name plate, no bubble, no captions) that flies between the hero's slot and the dock while the real card is hidden
// (data-flight). It is a child of <body>, never an ancestor of the widget, so its transforms and sizes cannot confine the widget's overlay.
import { CARD_FLIGHT, cubicBezier, mix, mixRect, type Rect } from "@/lib/card-flight";

/** Where the call button's area is, relative to the card's own box (px), and the card's font size there (the button's sizes are in em). */
export type OrbRel = { x: number; y: number; w: number; h: number; fs: number };
/** The button's copy in the ghost: it moves and scales with the ghost, so the button is never anywhere the card is not. */
export type GhostOrb = { box: HTMLElement; from: OrbRel; to: OrbRel };
export type Ghost = { el: HTMLElement; canvas: HTMLCanvasElement; rect: () => Rect; radius: number; orb: GhostOrb | null };

export const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The radius of the card's frame in px, or null when the frame is not drawn (the circle: the docked orb card has no frame). */
export const frameRadius = (card: HTMLElement): number | null => {
  const frame = card.querySelector<HTMLElement>(".avatar-card__frame");
  if (!frame) return null;
  const style = getComputedStyle(frame);
  return style.display === "none" ? null : parseFloat(style.borderTopLeftRadius) || 0;
};

/** The area of the call button (the action area that holds the orb) relative to the card, or null when the card has no orb button shown. */
export function orbRelOf(card: HTMLElement): OrbRel | null {
  const orb = card.querySelector<HTMLElement>(".avatar-card__action .call-orb"); // the card's own button, not the call bar's
  const area = card.querySelector<HTMLElement>(".avatar-card__action");
  if (!orb || !area || getComputedStyle(orb).display === "none") return null;
  const c = card.getBoundingClientRect();
  const a = area.getBoundingClientRect();
  return { x: a.left - c.left, y: a.top - c.top, w: a.width, h: a.height, fs: parseFloat(getComputedStyle(card).fontSize) || 16 };
}

/** Draws what the card shows now (the playing loop's frame, else the poster) into a 4:5 canvas, covering it like object-fit: cover. */
function drawSnapshot(card: HTMLElement, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const videos = [...card.querySelectorAll<HTMLVideoElement>("video")];
  const source: CanvasImageSource | null =
    videos.find((v) => v.dataset.active === "true" && v.readyState >= 2) ?? videos.find((v) => !v.paused && v.readyState >= 2) ?? card.querySelector<HTMLImageElement>(".avatar-card__poster");
  ctx.fillStyle = getComputedStyle(card).getPropertyValue("--avatar-stage").trim() || "black"; // the stage colour of the theme, where no frame can be drawn
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!source) return;
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : (source as HTMLImageElement).naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : (source as HTMLImageElement).naturalHeight;
  if (!sw || !sh) return;
  const scale = Math.max(canvas.width / sw, canvas.height / sh);
  const w = sw * scale;
  const h = sh * scale;
  try {
    ctx.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  } catch {
    // a frame that cannot be drawn (not decoded yet): the stage colour stays
  }
}

/** Puts the ghost over `rect` (viewport px), with the card's picture as it is now. */
export function createGhost(card: HTMLElement, rect: Rect, radius: number, slotWidth: number): Ghost {
  const dpr = Math.min(window.devicePixelRatio || 1, CARD_FLIGHT.maxDpr);
  const el = document.createElement("div");
  el.className = "card-ghost";
  el.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.className = "card-ghost__canvas";
  canvas.width = Math.min(Math.round(slotWidth * dpr), CARD_FLIGHT.maxSnapshotWidth);
  canvas.height = Math.round(canvas.width * 1.25);
  drawSnapshot(card, canvas);
  const shade = document.createElement("div");
  shade.className = "card-ghost__shade";
  const ring = document.createElement("div");
  ring.className = "card-ghost__ring";
  ring.style.opacity = card.dataset.call === "connected" ? "1" : card.dataset.call === "connecting" ? "0.55" : "0";
  el.append(canvas, shade, ring);
  // the call button goes along: a copy of the orb in a box that stands where the button's area stands, and is placed on every frame (placeOrb)
  let orb: GhostOrb | null = null;
  const rel = orbRelOf(card);
  const live = card.querySelector<HTMLElement>(".avatar-card__action .call-orb");
  if (rel && live) {
    const box = document.createElement("div");
    box.className = "card-ghost__orb";
    const copy = live.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    copy.querySelectorAll("button").forEach((b) => b.setAttribute("tabindex", "-1"));
    const shiftX = getComputedStyle(live).getPropertyValue("--call-orb-x").trim();
    if (shiftX) copy.style.setProperty("--call-orb-x", shiftX); // the docked card's label grows to the left; the copy keeps that
    box.append(copy);
    el.append(box);
    orb = { box, from: rel, to: rel };
  }
  place(el, rect, radius);
  document.body.appendChild(el);
  const ghost: Ghost = { el, canvas, rect: () => rectOf(el), radius, orb };
  placeOrb(ghost, 0);
  return ghost;
}

/** Puts the button's copy where it belongs at `e` (0 = where the flight started, 1 = where it ends): its box and font size are mixed like the ghost's own. */
export function placeOrb(ghost: Ghost, e: number): void {
  const o = ghost.orb;
  if (!o) return;
  const m = (a: number, b: number) => a + (b - a) * e;
  o.box.style.left = `${m(o.from.x, o.to.x)}px`;
  o.box.style.top = `${m(o.from.y, o.to.y)}px`;
  o.box.style.width = `${m(o.from.w, o.to.w)}px`;
  o.box.style.height = `${m(o.from.h, o.to.h)}px`;
  o.box.style.fontSize = `${m(o.from.fs, o.to.fs)}px`;
}

/** Where the button's copy is now, as a start for a flight that goes on from here (a flight taken over in the air). */
export function orbNow(ghost: Ghost): OrbRel | null {
  const o = ghost.orb;
  if (!o) return null;
  const g = ghost.el.getBoundingClientRect();
  const b = o.box.getBoundingClientRect();
  return { x: b.left - g.left, y: b.top - g.top, w: b.width, h: b.height, fs: parseFloat(o.box.style.fontSize) || o.to.fs };
}

/** Sets where the button's copy ends up (measured on the real card after it has switched) and starts the flight of it from where it is. */
export function aimOrb(ghost: Ghost, from: OrbRel | null, to: OrbRel | null): void {
  if (!ghost.orb) return;
  ghost.orb.from = from ?? ghost.orb.from;
  ghost.orb.to = to ?? ghost.orb.from; // the new place has no button area: the copy stays as it is
}

const place = (el: HTMLElement, r: Rect, radius: number) => {
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
  el.style.borderRadius = `${radius}px`;
};

/**
 * Flies the ghost from `getFrom()` to `getTo()` (both read on every frame, so a page that is still scrolling is followed), and calls `done` at the end.
 * Returns the function that stops it where it is.
 */
export function flyGhost(ghost: Ghost, getFrom: () => Rect, getTo: () => Rect, toRadius: number, done: () => void): () => void {
  const ease = cubicBezier(...CARD_FLIGHT.ease);
  const fromRadius = ghost.radius;
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / CARD_FLIGHT.ms);
    const e = ease(p);
    place(ghost.el, mixRect(getFrom(), getTo(), e), mix(fromRadius, toRadius, e));
    placeOrb(ghost, e);
    if (p < 1) raf = requestAnimationFrame(step);
    else done();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Keeps the ghost on `getTo()` for `ms` more (the crossfade): the real card under it is in the document, which goes on scrolling, so a ghost that stayed where it
 * landed would slide off it while it fades. Returns the function that stops it.
 */
export function followGhost(ghost: Ghost, getTo: () => Rect, toRadius: number, ms: number): () => void {
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    place(ghost.el, getTo(), toRadius);
    placeOrb(ghost, 1);
    if (now - t0 < ms) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Takes the ghost away: fades it out over the (already shown) real card, or at once. */
export function dropGhost(ghost: Ghost, fade: boolean): void {
  const gone = () => {
    ghost.el.remove();
    ghost.canvas.width = 0; // the snapshot's pixels are given back at once, not when the garbage collector gets to them
    ghost.canvas.height = 0;
  };
  if (!fade) {
    gone();
    return;
  }
  ghost.el.style.transition = `opacity ${CARD_FLIGHT.crossfadeMs}ms linear`;
  ghost.el.style.opacity = "0";
  window.setTimeout(gone, CARD_FLIGHT.crossfadeMs + 50);
}
