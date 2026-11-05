"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { resolveGalleryHash, usedCategories, categoryHash, photoHash, spotHash, type GalleryCategory } from "@/lib/gallery-model";
import { createGalleryStore, type GalleryEvent } from "@/lib/gallery-store";
import type { Language } from "@/lib/schema";
import { parseFocus, spotPlacement } from "@/lib/spot-position";
import { ui, uiFmt } from "@/lib/ui-strings";
import type { GallerySlide, GallerySpot } from "./gallery-props";

/** What an address or the agent got back: shown (now or queued behind the visitor's own swipe), or not a thing of this gallery. */
export type GalleryOutcome = "handled" | "queued" | "unhandled";

/** What is on screen, for the page context of the voice agent. */
export type GalleryView = { category: GalleryCategory; photo: string; index: number; total: number; spot: string | null };

/** Methods placed on the gallery element (section#gallery) for the voice agent and other outside callers. */
export type GalleryApi = {
  goToPhoto(index: number): void;
  next(): void;
  previous(): void;
  /** Shows what a gallery address names: "#gallery", "#gallery-interior", "#gallery-7", "#photo-<id>", "#spot-<id>". "unhandled" for anything else, unknown names included. */
  showAddress(hash: string): GalleryOutcome;
  /** The photo, category and open spot on screen (index is 1-based, as in the counter). */
  getView(): GalleryView;
};
export type GalleryElement = HTMLElement & GalleryApi;
export type GalleryChangeDetail = { index: number; count: number; photo: string; category: GalleryCategory; spot: string | null };

type Props = { slides: GallerySlide[]; lang: Language; autoplaySeconds: number | null; categoryLabels?: Record<GalleryCategory, string> };

/** How long after the last touch of the track a scroll still counts as the visitor's (a finger lifted, the momentum going on). */
const HANDS_MS = 400;
/** How long the scroll events of our own re-alignment (after a resize) are ignored. */
const QUIET_SCROLL_MS = 150;

const DEFAULT_LABELS: Record<GalleryCategory, string> = { exterior: "Exterior", interior: "Interior", details: "Details" };

/**
 * Showcase gallery. ONE sequence of photos (exterior, interior, details), a CSS scroll-snap track (native swipe), a counter, dots and a
 * passive category indicator (aria-hidden: it shows where in the sequence the current photo is, it is not a control), the caption,
 * previous/next buttons on wide screens, a thumbnail strip and hotspots that open a small card. There is no full-screen viewer.
 *
 * The state (photo, open spot) lives in one store (lib/gallery-store.ts): the track, the buttons, the address and the
 * agent all read and change it. A change from the agent waits while the visitor is swiping or tapping (the store queues it).
 * A live region announces changes after a visitor or agent action, never during the slideshow.
 */
export function Gallery({ slides, lang, autoplaySeconds, categoryLabels = DEFAULT_LABELS }: Props) {
  const count = slides.length;
  const [store] = useState(() => createGalleryStore(count));
  const st = useSyncExternalStore(store.subscribe, store.get, store.get);
  const current = st.index;
  const slide = slides[current];
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const cardCloseRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const pending = useRef<number | null>(null);
  const lastHands = useRef(Number.NEGATIVE_INFINITY);
  const quiet = useRef(0);
  const lastEvent = useRef({ index: 0, spot: null as string | null });

  const refs = useMemo(() => slides.map((s) => ({ id: s.id, aliases: s.aliases, category: s.category, hotspots: s.spots })), [slides]);
  const clamp = useCallback((i: number) => Math.min(Math.max(Math.round(i), 0), count - 1), [count]);
  const labelOf = useCallback((c: GalleryCategory) => categoryLabels[c] ?? DEFAULT_LABELS[c], [categoryLabels]);
  const photoText = useCallback((i: number) => uiFmt("gallery.photo", lang, { category: labelOf(slides[i].category), n: i + 1, total: count, caption: slides[i].caption }), [count, labelOf, lang, slides]);

  // the store's state is the truth; these small wrappers are what the buttons and the API call
  const visitor = useCallback((event: GalleryEvent) => store.user(event), [store]);
  const stateRef = useRef({ current, spot: st.spotId });
  useEffect(() => {
    stateRef.current = { current, spot: st.spotId };
  });

  /** Smooth unless the visitor asked for less motion. */
  const scrollSectionIntoView = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    // the whole block (stage, dots, tabs, thumbnails) must be on screen, not only the photo: when the title above the stage does not fit with it, the scroll
    // goes a little past the section's top (a negative scroll margin), so the stage starts a little under the top of the window; when it fits, the title shows too
    const stage = section.querySelector<HTMLElement>(".gallery__viewport");
    // the last control under the stage that is drawn: the thumbnails (not on a phone, where they are hidden), else the dots and the category marker
    const drawn = (el: HTMLElement | null) => (el && el.getBoundingClientRect().height > 0 ? el : null);
    const strip = drawn(section.querySelector<HTMLElement>(".gallery__thumbs-wrap")) ?? drawn(section.querySelector<HTMLElement>(".gallery__info")) ?? stage;
    section.style.scrollMarginTop = "";
    if (stage && strip) {
      const top = section.getBoundingClientRect().top;
      const above = stage.getBoundingClientRect().top - top;
      const blockHeight = strip.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
      const air = 16;
      if (above > air && above + blockHeight + 2 * air > window.innerHeight) section.style.scrollMarginTop = `${-(above - air)}px`;
    }
    section.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [reducedMotion]);

  /** An address or the agent. `via` "visitor": a link the visitor followed (applied at once, the address is already in the bar); "api": the agent (queued behind the visitor's own action, the address is written). */
  const show = useCallback(
    (hash: string, via: "visitor" | "api"): GalleryOutcome => {
      const target = resolveGalleryHash(refs, hash);
      if (!target || target.kind === "unknown") {
        if (target && process.env.NODE_ENV !== "production") console.warn(`gallery: ${hash}: ${target.reason}`);
        return "unhandled";
      }
      const write = (h: string) => {
        if (via === "api") window.history.replaceState(window.history.state, "", h);
      };
      if (target.kind === "section") {
        scrollSectionIntoView();
        write("#gallery");
        return "handled";
      }
      const event: GalleryEvent = target.kind === "spot" ? { type: "spot", index: target.index, spotId: target.spotId } : { type: "go", index: target.index };
      const result = via === "visitor" ? (store.user(event), "applied") : store.request(event);
      scrollSectionIntoView();
      write(target.kind === "spot" ? spotHash(target.spotId) : target.kind === "category" ? categoryHash(target.category) : photoHash(slides[target.index].id));
      return result === "queued" ? "queued" : "handled";
    },
    [refs, scrollSectionIntoView, slides, store],
  );

  useEffect(() => {
    const el = sectionRef.current as GalleryElement | null;
    if (!el) return;
    const api: GalleryApi = {
      goToPhoto: (i) => void store.request({ type: "go", index: clamp(i) }),
      next: () => void store.request({ type: "go", index: clamp(store.get().index + 1) }),
      previous: () => void store.request({ type: "go", index: clamp(store.get().index - 1) }),
      showAddress: (hash) => show(hash, "api"),
      getView: () => {
        const now = store.get(); // the store, not the last render: the agent may ask right after it changed something
        return { category: slides[now.index].category, photo: slides[now.index].id, index: now.index + 1, total: count, spot: now.spotId };
      },
    };
    Object.assign(el, api);
    return () => {
      for (const k of Object.keys(api)) delete (el as unknown as Record<string, unknown>)[k];
    };
  }, [clamp, count, show, slides, store]);
  useEffect(() => () => store.dispose(), [store]);

  // "gallery-change" on every change of the photo or the open spot
  useEffect(() => {
    const last = lastEvent.current;
    if (last.index === current && last.spot === st.spotId) return;
    lastEvent.current = { index: current, spot: st.spotId };
    sectionRef.current?.dispatchEvent(
      new CustomEvent<GalleryChangeDetail>("gallery-change", { bubbles: true, detail: { index: current, count, photo: slides[current].id, category: slides[current].category, spot: st.spotId } }),
    );
  }, [current, st.spotId, count, slides]);

  // the store drives the track: a change that did not come from the track itself scrolls it
  useEffect(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    // "already there" is only true when no slide to ANOTHER photo is still flying: a second agent request that arrives while the track passes
    // its photo would otherwise be skipped, and the first slide would settle on the old one (confirmed to the agent, never shown)
    const flyingElsewhere = pending.current !== null && pending.current !== current;
    if (!flyingElsewhere && clamp(track.scrollLeft / track.clientWidth) === current) return;
    pending.current = current;
    if (typeof track.scrollTo === "function") track.scrollTo({ left: current * track.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
  }, [current, st.revision, clamp, reducedMotion]);

  // the track drives the store: follow swipes (the category indicator changes while the visitor swipes), ignore our own scrolls
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    if (Date.now() < quiet.current) return; // our own re-alignment
    const index = clamp(track.scrollLeft / track.clientWidth);
    if (pending.current !== null) {
      if (index === pending.current) pending.current = null;
      return;
    }
    // only a scroll the visitor drives (hands on the track a moment ago, kept alive while the momentum goes on) counts as activity: the settling of
    // the agent's own slide must not make the next agent request wait
    if (Date.now() - lastHands.current < HANDS_MS) {
      lastHands.current = Date.now();
      store.touch();
    }
    store.follow(index);
  }, [clamp, store]);
  // the visitor's hands on the track: a scroll of ours is over, and a queued agent request waits
  const onHands = useCallback(() => {
    pending.current = null;
    lastHands.current = Date.now();
    store.touch();
  }, [store]);

  // Warm up the current photo and its neighbours. This is done on the DOM after hydration instead of with
  // loading="eager" in the markup, because Next adds a <link rel=preload> for every eager image, and a preload
  // that is used late makes Chrome warn "preloaded but not used".
  useEffect(() => {
    const images = sectionRef.current?.querySelectorAll<HTMLImageElement>(".gallery__img");
    images?.forEach((img, i) => {
      if (Math.abs(i - current) <= 1) img.loading = "eager";
    });
  }, [current, count]);

  // thumbnail strip: show that it scrolls (edge fades) and keep the active thumbnail in view without moving the page
  const thumbsRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const updateEdges = useCallback(() => {
    const strip = thumbsRef.current;
    if (!strip) return;
    const start = strip.scrollLeft > 1;
    const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges, count]);
  useEffect(() => {
    const strip = thumbsRef.current;
    const item = strip?.children[current] as HTMLElement | undefined;
    if (!strip || !item) return;
    const left = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
    strip.scrollTo?.({ left: Math.max(0, left), behavior: reducedMotion ? "auto" : "smooth" });
  }, [current, reducedMotion]);

  // keep the track aligned to the current photo when the width changes (resize, rotation, scrollbar); measure the stage for the spots
  const align = useCallback(() => {
    const track = trackRef.current;
    if (track && track.clientWidth > 0) {
      // the store is the truth: put the track back on its photo at once (not smoothly) and ignore the scroll events of doing so, so a resize
      // (rotation, the address bar of a phone, a screenshot tool) can never be read as a swipe to another photo
      quiet.current = Date.now() + QUIET_SCROLL_MS;
      track.scrollTo?.({ left: stateRef.current.current * track.clientWidth, behavior: "instant" });
    }
    const first = track?.firstElementChild as HTMLElement | null | undefined;
    if (first && first.clientWidth > 0 && first.clientHeight > 0) {
      setBox((prev) => (prev && prev.width === first.clientWidth && prev.height === first.clientHeight ? prev : { width: first.clientWidth, height: first.clientHeight }));
    }
  }, []);
  useEffect(() => {
    align();
    window.addEventListener("resize", align);
    return () => window.removeEventListener("resize", align);
  }, [align]);

  // addresses: on load and when the visitor follows a link (an address that names nothing here is left alone)
  useEffect(() => {
    const apply = () => void show(window.location.hash, "visitor");
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [show]);

  // reduced motion and tab visibility
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mq.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const autoplay = autoplaySeconds !== null && count > 1 && !reducedMotion;
  const paused = hovered || focused || hidden || st.spotId !== null;
  useEffect(() => {
    if (!autoplay || paused) return;
    const timer = setInterval(() => store.auto((stateRef.current.current + 1) % count), autoplaySeconds * 1000);
    return () => clearInterval(timer);
  }, [autoplay, paused, autoplaySeconds, count, store]);

  // the spot card: a visitor's tap moves focus into it, closing it returns focus to its marker
  const spotFocus = useRef<string | null>(null);
  useEffect(() => {
    if (st.source !== "user") {
      spotFocus.current = st.spotId;
      return;
    }
    if (st.spotId && spotFocus.current !== st.spotId) cardCloseRef.current?.focus({ preventScroll: true });
    else if (!st.spotId && spotFocus.current) sectionRef.current?.querySelector<HTMLElement>(`[data-spot="${CSS.escape(spotFocus.current)}"]`)?.focus({ preventScroll: true });
    spotFocus.current = st.spotId;
  }, [st.spotId, st.source]);

  const openSpot: GallerySpot | null = useMemo(() => slides[current]?.spots.find((s) => s.id === st.spotId) ?? null, [slides, current, st.spotId]);

  // what the live region says: the photo (with its category) or the spot, only after a visitor or agent action
  const announcement = st.source === "user" || st.source === "api" ? (openSpot ? [openSpot.label, ...openSpot.facts.map((f) => f.value), ...(openSpot.text ? [openSpot.text] : [])].join(". ") : photoText(current)) : "";

  if (count === 0) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    store.touch();
    if (e.key === "Escape" && st.spotId) {
      e.preventDefault();
      visitor({ type: "closeSpot" });
      return;
    }
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("gallery__viewport")) return;
    const keys: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: count - 1 };
    if (e.key in keys) {
      e.preventDefault();
      visitor({ type: "go", index: clamp(keys[e.key]) });
    }
  };

  const category = slide.category;
  const categories = usedCategories(slides);

  return (
    <section
      ref={sectionRef}
      className="gallery"
      id="gallery"
      data-block="gallery"
      data-count={count}
      data-category={category}
      data-autoplay={!autoplay ? "off" : paused ? "paused" : "on"}
      role="region"
      aria-roledescription="carousel"
      aria-label={ui("section.gallery", lang)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="container">
        <h2 className="section-title">{ui("gallery.title", lang)}</h2>
        <div className="gallery__viewport" tabIndex={0} onKeyDown={onKeyDown} onPointerDown={onHands} onWheel={onHands} onTouchStart={onHands}>
          <ul className="gallery__track" ref={trackRef} onScroll={onScroll}>
            {slides.map((s, i) => (
              <li
                key={s.id}
                className="gallery__slide"
                role="group"
                aria-roledescription="slide"
                aria-label={photoText(i)}
                data-index={i}
                data-id={s.id}
                data-category={s.category}
              >
                <Image
                  className="gallery__img"
                  src={s.src}
                  width={s.width}
                  height={s.height}
                  alt={s.alt}
                  sizes="(min-width: 56em) 1100px, 100vw"
                  loading="lazy"
                  style={{ objectPosition: s.position }}
                />
                {s.spots.map((spot, n) => {
                  const at = spotPlacement(spot, s, box, parseFocus(s.position));
                  // the tooltip opens towards the middle of the photo: right of a marker near the left edge, left of one near the right edge, under one near the top
                  const edge = at.left < 24 ? "start" : at.left > 76 ? "end" : undefined;
                  const isOpen = i === current && st.spotId === spot.id;
                  return (
                    <button
                      key={spot.id}
                      type="button"
                      className="gallery__spot"
                      data-spot={spot.id}
                      data-edge={edge}
                      data-low={at.top < 22 ? "" : undefined}
                      style={{ left: `${at.left}%`, top: `${at.top}%`, "--spot-delay": `${(n * 1.9).toFixed(1)}s` } as CSSProperties}
                      aria-label={uiFmt("gallery.spot.open", lang, { label: spot.label })}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? "gallery-spot-card" : undefined}
                      tabIndex={i === current ? 0 : -1}
                      onClick={() => visitor(isOpen ? { type: "closeSpot" } : { type: "spot", index: i, spotId: spot.id })}
                    >
                      {/* the centre (a dot at rest, a "+" on hover and focus, a "×" while open) and the title's tooltip; both are looks, the name is the label above */}
                      <span className="gallery__spot-mark" aria-hidden="true" />
                      <span className="gallery__spot-tip" aria-hidden="true">
                        {spot.label}
                      </span>
                    </button>
                  );
                })}
              </li>
            ))}
          </ul>
          {count > 1 && (
            <>
              <button type="button" className="gallery__nav gallery__nav--prev" aria-label={ui("gallery.previous", lang)} disabled={current === 0} onClick={() => visitor({ type: "go", index: current - 1 })} />
              <button type="button" className="gallery__nav gallery__nav--next" aria-label={ui("gallery.next", lang)} disabled={current === count - 1} onClick={() => visitor({ type: "go", index: current + 1 })} />
            </>
          )}
          <p className="gallery__counter" aria-hidden="true">
            {current + 1} / {count}
          </p>
          {openSpot && (
            <div className="gallery__spot-card" id="gallery-spot-card" role="group" aria-label={openSpot.label} data-spot-card={openSpot.id}>
              <div className="gallery__spot-head">
                <p className="gallery__spot-title">{openSpot.label}</p>
                <button ref={cardCloseRef} type="button" className="gallery__spot-close" aria-label={ui("gallery.spot.close", lang)} onClick={() => visitor({ type: "closeSpot" })}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {openSpot.facts.length > 0 && (
                <dl className="gallery__spot-facts">
                  {openSpot.facts.map((f) => (
                    <div key={f.label}>
                      {f.label.toLocaleLowerCase() !== openSpot.label.toLocaleLowerCase() && <dt>{f.label}</dt>}
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {openSpot.text && <p className="gallery__spot-text">{openSpot.text}</p>}
            </div>
          )}
        </div>

        <div className="gallery__info">
          {count > 1 && (
            <div className="gallery__dots" aria-hidden="true">
              {slides.map((s, i) => (
                <span key={s.id} className="gallery__dot" data-active={i === current ? "true" : undefined} data-category={s.category} />
              ))}
            </div>
          )}
          {categories.length > 1 && (
            <ol className="gallery__cats" aria-hidden="true">
              {categories.map((c) => (
                <li key={c} className="gallery__cat" data-category={c} data-active={c === category ? "true" : undefined}>
                  {labelOf(c)}
                </li>
              ))}
            </ol>
          )}
        </div>

        {count > 1 && (
          <div className={`gallery__thumbs-wrap${edges.start ? " gallery__thumbs-wrap--more-start" : ""}${edges.end ? " gallery__thumbs-wrap--more-end" : ""}`}>
            <ul className="gallery__thumbs" ref={thumbsRef} onScroll={updateEdges}>
              {slides.map((s, i) => (
                <li key={s.id} data-group-start={i === 0 || slides[i - 1].category !== s.category ? "true" : undefined} data-category={s.category}>
                  <button
                    type="button"
                    className="gallery__thumb"
                    aria-label={uiFmt("gallery.thumb", lang, { n: i + 1 })}
                    aria-current={i === current ? "true" : undefined}
                    onClick={() => visitor({ type: "go", index: i })}
                  >
                    <Image className="gallery__thumb-img" src={s.src} width={s.width} height={s.height} alt="" sizes="96px" loading="lazy" style={{ objectPosition: s.position }} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="sr-only" aria-live="polite" data-gallery-live>
          {announcement}
        </p>
      </div>

    </section>
  );
}
