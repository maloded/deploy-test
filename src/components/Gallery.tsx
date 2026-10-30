"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Language } from "@/lib/schema";
import { ui, uiFmt } from "@/lib/ui-strings";
import type { GallerySlide } from "./gallery-props";
import { Lightbox } from "./Lightbox";

/** Methods placed on the gallery element (section#gallery) for the voice agent and other outside callers. */
export type GalleryApi = {
  goToPhoto(index: number): void;
  next(): void;
  previous(): void;
  openLightbox(index?: number): void;
  closeLightbox(): void;
};
export type GalleryElement = HTMLElement & GalleryApi;
export type GalleryChangeDetail = { index: number; count: number };

type Source = "user" | "auto";

/**
 * Showcase carousel: CSS scroll-snap track (native swipe), previous/next buttons, thumbnails, counter,
 * keyboard arrows, optional autoplay, and a lightbox. No dependency.
 * A live region announces slide changes only after a user action, never during autoplay.
 */
export function Gallery({ slides, lang, autoplaySeconds }: { slides: GallerySlide[]; lang: Language; autoplaySeconds: number | null }) {
  const count = slides.length;
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pending = useRef<{ index: number; user: boolean } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const lastIndex = useRef(0);

  const clamp = useCallback((i: number) => Math.min(Math.max(Math.round(i), 0), count - 1), [count]);

  const goTo = useCallback(
    (i: number, source: Source = "user") => {
      if (count === 0) return;
      const index = clamp(i);
      setCurrent(index);
      setLightbox((open) => (open === null ? open : index));
      if (source === "user") setAnnouncement(uiFmt("gallery.slide", lang, { n: index + 1, total: count }));
      const track = trackRef.current;
      if (track && typeof track.scrollTo === "function") {
        pending.current = { index, user: source === "user" };
        track.scrollTo({ left: index * track.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
      }
    },
    [clamp, count, lang, reducedMotion],
  );

  // keep the API pointing at the latest state without re-attaching it on every render
  const state = useRef({ current, lightbox, goTo });
  useEffect(() => {
    state.current = { current, lightbox, goTo };
  });

  const openLightbox = useCallback(
    (index?: number) => {
      if (count === 0) return;
      if (state.current.lightbox === null) trigger.current = document.activeElement as HTMLElement | null;
      const i = clamp(index ?? state.current.current);
      state.current.goTo(i);
      setLightbox(i);
    },
    [clamp, count],
  );
  const closeLightbox = useCallback(() => setLightbox(null), []);
  // The page API closes it synchronously: a caller that opens another dialog right after (the agent's #contact) must come after the focus return.
  const closeLightboxNow = useCallback(() => flushSync(() => setLightbox(null)), []);

  useEffect(() => {
    const el = sectionRef.current as GalleryElement | null;
    if (!el) return;
    const api: GalleryApi = {
      goToPhoto: (i) => state.current.goTo(i),
      next: () => state.current.goTo(state.current.current + 1),
      previous: () => state.current.goTo(state.current.current - 1),
      openLightbox,
      closeLightbox: closeLightboxNow,
    };
    Object.assign(el, api);
    return () => {
      for (const k of Object.keys(api)) delete (el as unknown as Record<string, unknown>)[k];
    };
  }, [openLightbox, closeLightboxNow]);

  // "gallery-change" event on every change of the current photo
  useEffect(() => {
    if (lastIndex.current === current) return;
    lastIndex.current = current;
    sectionRef.current?.dispatchEvent(
      new CustomEvent<GalleryChangeDetail>("gallery-change", { bubbles: true, detail: { index: current, count } }),
    );
  }, [current, count]);

  // follow swipes and programmatic scrolls
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = clamp(track.scrollLeft / track.clientWidth);
    const wanted = pending.current;
    if (wanted) {
      if (index === wanted.index) pending.current = null;
      return;
    }
    if (index !== state.current.current) {
      setCurrent(index);
      setAnnouncement(uiFmt("gallery.slide", lang, { n: index + 1, total: count })); // a swipe is a user action
    }
  }, [clamp, count, lang]);

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

  // keep the track aligned to the current photo when the width changes (resize, rotation, scrollbar)
  const align = useCallback(() => {
    const track = trackRef.current;
    if (track && track.clientWidth > 0) track.scrollLeft = state.current.current * track.clientWidth;
  }, []);
  useEffect(() => {
    window.addEventListener("resize", align);
    return () => window.removeEventListener("resize", align);
  }, [align]);

  // return focus to what opened the lightbox. A photo button is replaced by the button of the photo that is
  // current now (the viewer may have moved on), and focus never scrolls the track back to the old photo.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (lightbox === null && wasOpen.current) {
      const opener = trigger.current;
      const buttons = sectionRef.current?.querySelectorAll<HTMLElement>(".gallery__open");
      const target = opener?.classList.contains("gallery__open") ? (buttons?.[state.current.current] ?? opener) : opener;
      target?.focus({ preventScroll: true });
      align();
    }
    wasOpen.current = lightbox !== null;
    document.body.style.overflow = lightbox !== null ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightbox, align]);

  // deep links: #gallery (native) and #gallery-3 (1-based; a number outside 1..count is ignored)
  useEffect(() => {
    const apply = () => {
      const m = /^#gallery-(\d+)$/.exec(window.location.hash);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > count) return;
      state.current.goTo(Number(m[1]) - 1, "auto");
      sectionRef.current?.scrollIntoView?.();
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [count]);

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
  const paused = hovered || focused || hidden || lightbox !== null;
  useEffect(() => {
    if (!autoplay || paused) return;
    const timer = setInterval(() => state.current.goTo((state.current.current + 1) % count, "auto"), autoplaySeconds * 1000);
    return () => clearInterval(timer);
  }, [autoplay, paused, autoplaySeconds, count]);

  if (count === 0) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: count - 1 };
    if (e.key in keys) {
      e.preventDefault();
      goTo(keys[e.key]);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="gallery"
      id="gallery"
      data-block="gallery"
      data-count={count}
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
        <h2 className="sr-only">{ui("section.gallery", lang)}</h2>
        <div className="gallery__viewport" tabIndex={0} onKeyDown={onKeyDown}>
          <ul className="gallery__track" ref={trackRef} onScroll={onScroll}>
            {slides.map((s, i) => (
              <li
                key={s.src}
                className="gallery__slide"
                role="group"
                aria-roledescription="slide"
                aria-label={uiFmt("gallery.slide", lang, { n: i + 1, total: count })}
                data-index={i}
              >
                <button type="button" className="gallery__open" aria-label={uiFmt("gallery.open", lang, { n: i + 1 })} onClick={() => openLightbox(i)}>
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
                </button>
              </li>
            ))}
          </ul>
          {count > 1 && (
            <>
              <button type="button" className="gallery__nav gallery__nav--prev" aria-label={ui("gallery.previous", lang)} disabled={current === 0} onClick={() => goTo(current - 1)} />
              <button type="button" className="gallery__nav gallery__nav--next" aria-label={ui("gallery.next", lang)} disabled={current === count - 1} onClick={() => goTo(current + 1)} />
            </>
          )}
        </div>

        <div className="gallery__bar">
          <p className="gallery__counter">
            {current + 1} / {count}
          </p>
          {count > 1 && (
            <div className={`gallery__thumbs-wrap${edges.start ? " gallery__thumbs-wrap--more-start" : ""}${edges.end ? " gallery__thumbs-wrap--more-end" : ""}`}>
            <ul className="gallery__thumbs" ref={thumbsRef} onScroll={updateEdges}>
              {slides.map((s, i) => (
                <li key={s.src}>
                  <button
                    type="button"
                    className="gallery__thumb"
                    aria-label={uiFmt("gallery.thumb", lang, { n: i + 1 })}
                    aria-current={i === current ? "true" : undefined}
                    onClick={() => goTo(i)}
                  >
                    <Image className="gallery__thumb-img" src={s.src} width={s.width} height={s.height} alt="" sizes="96px" loading="lazy" style={{ objectPosition: s.position }} />
                  </button>
                </li>
              ))}
            </ul>
            </div>
          )}
        </div>
        <p className="sr-only" aria-live="polite" data-gallery-live>
          {announcement}
        </p>
      </div>

      {lightbox !== null && <Lightbox slides={slides} index={lightbox} lang={lang} onIndex={(i) => goTo(i)} onClose={closeLightbox} />}
    </section>
  );
}
