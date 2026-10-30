// The "ghost" of the avatar card. A light clone (one frame of the playing loop on a canvas, the
// shade and the ring; no widget, no name plate, no bubble, no captions) that flies between the hero's slot and the dock while the real card is hidden
// (data-flight). It is a child of <body>, never an ancestor of the widget, so its transforms and sizes cannot confine the widget's overlay.
import { CARD_FLIGHT, cubicBezier, mix, mixRect, type Rect } from "@/lib/card-flight";

export type Ghost = { el: HTMLElement; canvas: HTMLCanvasElement; rect: () => Rect; radius: number };

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
  place(el, rect, radius);
  document.body.appendChild(el);
  return { el, canvas, rect: () => rectOf(el), radius };
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
