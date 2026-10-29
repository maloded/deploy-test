"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CardState } from "@/lib/agent-state";
import { pick } from "@/lib/i18n";
import type { WidgetHost } from "@/lib/hanc-bridge";
import type { Language } from "@/lib/languages";
import type { AvatarSlot, ResolvedAvatar } from "@/lib/avatar-manifest";
import { activeSlot, isSingleLoop, motionAllowed, pickFormat, slotsToMount } from "@/lib/avatar-view";
import { useAgentState } from "./use-agent-state";
import { useCardTilt } from "./use-card-tilt";

/**
 * The avatar card of the voice agent: a fixed rectangle in the bottom-right corner. The poster is always there; up to three
 * loops lie on top of it and change by opacity only. The real widget (the start button) is `children`, mounted inside the card.
 *
 * Loading: the poster at once; the idle loop (or a pack's only loop) when the page is idle; the listen and speak loops on the
 * first touch of the card or when a call starts. Poster only with prefers-reduced-motion or Save-Data. Videos pause when the tab is
 * hidden. One format per loop, never both. A video that fails is dropped and the poster stays.
 *
 * Tilt: the frame (border, radius, clipping and the pictures) is turned as a whole by useCardTilt, perspective inside its transform;
 * the widget is a SIBLING of the frame, so it never tilts. Do not put transform, filter, perspective, will-change or contain on this element or on any ancestor of
 * `children`: they turn it into the containing block of the widget's position:fixed form overlay and confine the overlay to the card
 * (see the CSS guard test).
 */
const noSubscription = () => () => {};
const webmSupported = () => document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== "";
const tabVisible = () => document.visibilityState !== "hidden";
const subscribeVisibility = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)");
const subscribeMotion = (notify: () => void) => {
  const query = reducedMotion();
  query?.addEventListener?.("change", notify);
  return () => query?.removeEventListener?.("change", notify);
};
const motionNow = () =>
  motionAllowed({ reducedMotion: Boolean(reducedMotion()?.matches), saveData: Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) });

export function AgentAvatarCard({ avatar, lang, host, children }: { avatar: ResolvedAvatar; lang?: Language; host?: WidgetHost | null; children: ReactNode }) {
  // reduced motion and Save-Data mean poster only (it follows a change of the system setting); false on the server, where no video is rendered
  const motion = useSyncExternalStore(subscribeMotion, motionNow, () => false);
  const canWebm = useSyncExternalStore(noSubscription, webmSupported, () => false);
  const visible = useSyncExternalStore(subscribeVisibility, tabVisible, () => true);
  const [pageIdle, setPageIdle] = useState(false);
  const [touched, setTouched] = useState(false);
  const [playing, setPlaying] = useState<Partial<Record<AvatarSlot, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<AvatarSlot, boolean>>>({});
  const videos = useRef<Partial<Record<AvatarSlot, HTMLVideoElement | null>>>({});
  const cardRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const state: CardState = useAgentState(cardRef, host);
  useCardTilt(cardRef, frameRef);

  // the idle loop waits for the page to be idle
  useEffect(() => {
    if (!motion) return;
    const idle = window.requestIdleCallback;
    if (idle) {
      const handle = idle(() => setPageIdle(true), { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setPageIdle(true), 1500);
    return () => window.clearTimeout(timer);
  }, [motion]);

  const touch = useCallback(() => setTouched(true), []);
  const mounted = slotsToMount(avatar, { motion, pageIdle, touched: touched || state !== "idle" }).filter((slot) => !failed[slot]);
  const active = activeSlot(avatar, state);
  // the caption: the name, the seller's one line and a small marker; no text in seller.json means no caption
  const caption = avatar.caption && lang ? { tagline: avatar.caption.tagline && pick(avatar.caption.tagline, lang), badge: avatar.caption.badge && pick(avatar.caption.badge, lang) } : null;

  // only the shown loop plays, and only while the tab is visible
  useEffect(() => {
    for (const slot of mounted) {
      const video = videos.current[slot];
      if (!video) continue;
      if (slot === active && visible) void video.play().catch(() => {});
      else video.pause();
    }
  });

  return (
    <section ref={cardRef} className={caption ? "avatar-card avatar-card--caption" : "avatar-card"} data-block="agent" data-placement="card" data-avatar={avatar.id} data-state={state} aria-label={avatar.name} onPointerDown={touch} onPointerEnter={touch} onFocusCapture={touch}>
      <div ref={frameRef} className="avatar-card__frame">
        <div className="avatar-card__media" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- a pack file served as it is from /avatars, sized by the card */}
          <img className="avatar-card__poster" src={avatar.poster} alt="" decoding="async" />
          {mounted.map((slot) => {
            const file = pickFormat(avatar[slot]!, canWebm);
            if (!file) return null;
            return (
              <video
                key={slot}
                ref={(el) => {
                  videos.current[slot] = el;
                  if (el) el.muted = true; // React does not always reflect the muted attribute; autoplay rules need it
                }}
                className="avatar-card__video"
                data-slot={slot}
                data-active={slot === active && playing[slot] ? "true" : "false"}
                src={file}
                muted
                loop
                playsInline
                preload={slot === "idle" || isSingleLoop(avatar) ? "none" : "auto"} // the idle loop starts by play(); listen and speak are mounted at the first touch to load now
                tabIndex={-1}
                disablePictureInPicture
                onPlaying={() => setPlaying((p) => ({ ...p, [slot]: true }))}
                onError={() => setFailed((f) => ({ ...f, [slot]: true }))}
              />
            );
          })}
        </div>
        {caption && (
          <div className="avatar-card__caption">
            <p className="avatar-card__title">
              <span className="avatar-card__name">{avatar.name}</span>
              {caption.badge && <span className="avatar-card__badge">{caption.badge}</span>}
            </p>
            {caption.tagline && <p className="avatar-card__tagline">{caption.tagline}</p>}
          </div>
        )}
      </div>
      <div className="avatar-card__action">{children}</div>
    </section>
  );
}
