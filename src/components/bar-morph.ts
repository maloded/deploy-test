// The morph between the avatar card and the call bar (phones, below 900px). The real card keeps its one element and just switches placement (like the desktop
// flight, card-flight-controller.ts); what the visitor sees travel is a ghost in <body> that is the card turning into the pill and back:
//
//   back layer (z 1099, under the card): the card's shadow, a shell in the stage colour cut to the shape (clip-path: inset() round), and the card's layers
//   (the picture on a canvas with the shade and the ring, cut to its own shape that goes from the card to the face circle, the name and the captions as they
//   were), which fade out going to the bar. The REAL bar stands at its place over it, cut to the part the shape covers, and fades in with its live parts (face,
//   the two lines, the timer): nothing of it is a copy, so the timer and the status never flicker.
//   front layer (z 1101): the call button's copy, which moves and scales by transform from the card's corner to the bar's right end.
//
// Everything that moves is a transform or an opacity, except the shapes, which are clip-paths (paint, no layout). The ghost is a child of <body>, never an
// ancestor of the widget, and every style is set inline from here: no CSS rule on a card element carries a transform.
import { BAR_MORPH, clipInset, clipWithin, counterRadius, ease, fadeAt, fadeEnd, mixBox, mixShape, type Dir, type Fade, type Shape } from "@/lib/bar-morph";
import { CARD_FLIGHT, type Rect } from "@/lib/card-flight";
import { rectOf } from "./card-ghost";

/** The geometry that moves: the shape, the picture's box, the shape the picture is cut to, and the button's box. All in viewport px. */
export type MorphState = { shape: Shape; pic: Rect; picClip: Shape; orb: Rect };
export type MorphGoal = { shape: () => Shape; pic: () => Rect; picClip: () => Shape; orb: () => Rect };

export type Morph = {
  dir: Dir;
  back: HTMLElement;
  top: HTMLElement;
  shell: HTMLElement;
  shadow: HTMLElement;
  layers: HTMLElement;
  picClip: HTMLElement;
  pic: HTMLElement;
  canvas: HTMLCanvasElement;
  cardBox: HTMLElement;
  orbBox: HTMLElement | null;
  /** The card's size when the morph was made: the base the picture, the shadow and the name layer are scaled from. */
  base: { w: number; h: number };
  /** The orb's start size (the clone is laid out at it). */
  orbBase: { w: number; h: number } | null;
  bar: HTMLElement;
  /** The bar's own box (it stands where it ends, whatever the shape does). */
  barBox: Rect;
  /** Where everything is now, and the fades now: a morph taken over in the air goes on from here. */
  cur: MorphState;
  fade: Fade;
};

const div = (cls: string): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = cls;
  return el;
};

/** A copy of a live element for the ghost: no ids (the real one keeps them), nothing to tab to. */
export function cleanCopy<T extends HTMLElement>(el: T): T {
  const copy = el.cloneNode(true) as T;
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copy.querySelectorAll("button, a, input").forEach((n) => n.setAttribute("tabindex", "-1"));
  copy.querySelectorAll("[aria-live]").forEach((n) => n.removeAttribute("aria-live"));
  return copy;
}

/** Draws the card's picture (a loop's frame, else the poster) into a 4:5 canvas, covering it like object-fit: cover. */
function snapshot(card: HTMLElement, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const videos = [...card.querySelectorAll<HTMLVideoElement>(".avatar-card__media video")];
  const source: CanvasImageSource | null = videos.find((v) => v.dataset.active === "true" && v.readyState >= 2) ?? videos.find((v) => !v.paused && v.readyState >= 2) ?? card.querySelector<HTMLImageElement>(".avatar-card__poster");
  ctx.fillStyle = getComputedStyle(card).getPropertyValue("--avatar-stage").trim() || "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!source) return;
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : (source as HTMLImageElement).naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : (source as HTMLImageElement).naturalHeight;
  if (!sw || !sh) return;
  const scale = Math.max(canvas.width / sw, canvas.height / sh);
  try {
    ctx.drawImage(source, (canvas.width - sw * scale) / 2, (canvas.height - sh * scale) / 2, sw * scale, sh * scale);
  } catch {
    // a frame that cannot be drawn yet: the stage colour stays
  }
}

/**
 * Builds the ghost for a morph that starts at `start` (and is appended to <body> at once). `orbSource` is the live call button to copy (the card's own going to
 * the bar, the bar's own coming back) and `orbRect` its area now. `size` is the card's size (the base of the picture and the shadow).
 */
export function createMorph(o: { dir: Dir; card: HTMLElement; bar: HTMLElement; barBox: Rect; size: { w: number; h: number }; start: MorphState; fade: Fade; orbSource: HTMLElement | null; orbRect: Rect | null }): Morph {
  const { size, start } = o;
  const dpr = Math.min(window.devicePixelRatio || 1, CARD_FLIGHT.maxDpr);
  const back = div("card-morph");
  back.setAttribute("aria-hidden", "true");
  const shadow = div("card-morph__shadow");
  shadow.style.width = `${size.w}px`;
  shadow.style.height = `${size.h}px`;
  const shell = div("card-morph__shell");
  const layers = div("card-morph__layers");
  const picClip = div("card-morph__clip");
  const pic = div("card-morph__pic");
  pic.style.width = `${size.w}px`;
  pic.style.height = `${size.h}px`;
  const canvas = document.createElement("canvas");
  canvas.className = "card-ghost__canvas";
  canvas.width = Math.min(Math.round(size.w * dpr), CARD_FLIGHT.maxSnapshotWidth);
  canvas.height = Math.round(canvas.width * 1.25);
  snapshot(o.card, canvas);
  const shade = div("card-ghost__shade");
  const ring = div("card-ghost__ring");
  ring.style.opacity = o.card.dataset.call === "connected" ? "1" : o.card.dataset.call === "connecting" ? "0.55" : "0";
  pic.append(canvas, shade, ring);
  picClip.append(pic);
  const cardBox = div("card-morph__card");
  cardBox.style.width = `${size.w}px`;
  cardBox.style.height = `${size.h}px`;
  cardBox.style.fontSize = getComputedStyle(o.card).fontSize;
  layers.append(picClip, cardBox);
  shell.append(layers);
  back.append(shadow, shell);

  const top = div("card-morph__top");
  top.setAttribute("aria-hidden", "true");
  let orbBox: HTMLElement | null = null;
  let orbBase: { w: number; h: number } | null = null;
  if (o.orbSource && o.orbRect) {
    orbBox = div("card-morph__orb");
    orbBox.style.width = `${o.orbRect.width}px`;
    orbBox.style.height = `${o.orbRect.height}px`;
    orbBox.style.fontSize = getComputedStyle(o.orbSource).fontSize;
    const shiftX = getComputedStyle(o.orbSource).getPropertyValue("--call-orb-x").trim();
    const copy = cleanCopy(o.orbSource);
    if (shiftX) copy.style.setProperty("--call-orb-x", shiftX);
    orbBox.append(copy);
    top.append(orbBox);
    orbBase = { w: o.orbRect.width, h: o.orbRect.height };
  }
  document.body.append(back, top);
  const m: Morph = { dir: o.dir, back, top, shell, shadow, layers, picClip, pic, canvas, cardBox, orbBox, base: size, orbBase, bar: o.bar, barBox: o.barBox, cur: start, fade: o.fade };
  render(m, start, o.fade);
  return m;
}

/** Adds the card's name and captions to the ghost, as they stand in the card now (`card` is in the hero placement, its frame hidden but laid out). */
export function addCardParts(m: Morph, card: HTMLElement): void {
  for (const sel of [".avatar-card__plate", ".avatar-card__captions"]) {
    const live = card.querySelector<HTMLElement>(sel);
    if (live) m.cardBox.append(cleanCopy(live));
  }
}

/** Puts everything where `st` says and shows the fades `f`: transforms, clip-paths and opacities only. `touchBar` false leaves the real bar alone (it has been given back). */
export function render(m: Morph, st: MorphState, f: Fade, touchBar = true): void {
  m.cur = st;
  m.fade = f;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  m.shell.style.clipPath = clipInset(st.shape, vw, vh);
  const sx = st.shape.width / m.base.w;
  const sy = st.shape.height / m.base.h;
  m.shadow.style.transform = `translate(${st.shape.left.toFixed(2)}px, ${st.shape.top.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  m.shadow.style.borderRadius = counterRadius(st.shape.radius, sx, sy);
  m.shadow.style.opacity = String(f.card);
  m.layers.style.opacity = String(f.card);
  m.picClip.style.clipPath = clipInset(st.picClip, vw, vh);
  m.pic.style.transform = `translate(${st.pic.left.toFixed(2)}px, ${st.pic.top.toFixed(2)}px) scale(${(st.pic.width / m.base.w).toFixed(4)}, ${(st.pic.height / m.base.h).toFixed(4)})`;
  m.cardBox.style.transform = `translate(${st.shape.left.toFixed(2)}px, ${st.shape.top.toFixed(2)}px)`; // the name and captions travel with the shape's corner, at their own size
  if (m.orbBox && m.orbBase) {
    m.orbBox.style.transform = `translate(${st.orb.left.toFixed(2)}px, ${st.orb.top.toFixed(2)}px) scale(${(st.orb.width / m.orbBase.w).toFixed(4)})`;
  }
  // the real bar: cut to what the shape covers and as visible as the bar's own parts are (not once it has been given back, in the crossfade at landing)
  if (touchBar) {
    m.bar.style.clipPath = clipWithin(m.barBox, st.shape);
    m.bar.style.opacity = String(f.pill);
  }
}

/** Readies the real bar for a morph: nothing but this script moves its opacity and clip until the morph is over. */
export function holdBar(bar: HTMLElement, fade: Fade): void {
  bar.style.transition = "none";
  bar.style.opacity = String(fade.pill);
  bar.style.visibility = "visible";
  bar.style.clipPath = "inset(100% 100% 100% 100%)";
}

/** Gives the bar back to the stylesheet. It is left exactly as it looks now (shown or not), so the stylesheet's own fade does not play. */
export function releaseBar(bar: HTMLElement): void {
  const shown = Number(bar.style.opacity) >= 0.5;
  bar.style.opacity = shown ? "1" : "0";
  bar.style.visibility = shown ? "visible" : "hidden";
  bar.style.clipPath = "";
  requestAnimationFrame(() => {
    bar.style.opacity = "";
    bar.style.visibility = "";
    bar.style.transition = "";
  });
}

/**
 * Flies the morph from where it is to `goal` (read on every frame, so a page that is still scrolling is followed), in BAR_MORPH.ms, and calls `done` at the end.
 * A morph taken over in the air goes on from its current state and fades. `liveFrom`, when given, is the start read on every frame (the card's slot, which the page
 * is still moving). Returns the function that stops it where it is.
 */
export function flyMorph(m: Morph, dir: Dir, goal: MorphGoal, done: () => void, liveFrom?: () => MorphState): () => void {
  m.dir = dir;
  const start = m.cur;
  const fromFade = m.fade;
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / BAR_MORPH.ms);
    const e = ease(p);
    const from = liveFrom ? liveFrom() : start; // going down from the hero the start is the slot, which the page is still moving: followed live
    render(
      m,
      { shape: mixShape(from.shape, goal.shape(), e), pic: mixBox(from.pic, goal.pic(), e), picClip: mixShape(from.picClip, goal.picClip(), e), orb: mixBox(from.orb, goal.orb(), e) },
      p >= 1 ? fadeEnd(dir) : fadeAt(e, dir, fromFade),
    );
    if (p < 1) raf = requestAnimationFrame(step);
    else done();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Keeps the ghost on the goal for `ms` more (the crossfade at landing: the page may still be scrolling under a ghost that goes to the card's slot). Returns the stop. */
export function followMorph(m: Morph, goal: MorphGoal, ms: number): () => void {
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    render(m, { shape: goal.shape(), pic: goal.pic(), picClip: goal.picClip(), orb: goal.orb() }, fadeEnd(m.dir), false);
    if (now - t0 < ms) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Takes the ghost away: fades it out over what has landed, or at once. */
export function dropMorph(m: Morph, fade: boolean): void {
  const gone = () => {
    m.back.remove();
    m.top.remove();
    m.canvas.width = 0; // the snapshot's pixels are given back at once
    m.canvas.height = 0;
  };
  if (!fade) {
    gone();
    return;
  }
  for (const el of [m.back, m.top]) {
    el.style.transition = `opacity ${BAR_MORPH.crossfadeMs}ms linear`;
    el.style.opacity = "0";
  }
  window.setTimeout(gone, BAR_MORPH.crossfadeMs + 50);
}

export { rectOf };
