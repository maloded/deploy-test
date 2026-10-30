"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CardState } from "@/lib/agent-state";
import type { WidgetHost } from "@/lib/hanc-bridge";
import type { Language } from "@/lib/languages";
import type { AvatarSlot, ResolvedAvatar } from "@/lib/avatar-manifest";
import { activeSlot, bubbleTextOf, hasBubble, isSingleLoop, liveTextOf, motionAllowed, pickFormat, roleLine, slotsToMount, startLabelOf } from "@/lib/avatar-view";
import { ui } from "@/lib/ui-strings";
import { useAgentState } from "./use-agent-state";
import { useCallStatus } from "./use-call-status";
import { useCallOutcome } from "./use-call-outcome";
import { useOrbRings } from "./use-orb-rings";
import { AgentCaptions } from "./AgentCaptions";
import { callAttribute } from "@/lib/call-outcome";
import { useCardTilt } from "./use-card-tilt";
import { useCardPlacement, type Placement } from "./use-card-placement";
import { useCallBubble } from "./use-call-bubble";
import { useRoleShort } from "./use-role-short";
import { useWidgetOverlay } from "./use-widget-overlay";
import { bubbleAllowed } from "@/lib/call-bubble";

/**
 * The avatar card of the voice agent, in the look of the Hanc role card (docs/reference/HANC-HERO-CARD.md names the Hanc file of each piece).
 * Structure: the card (untransformed) holds the frame (the one element that tilts: tile with the poster and up to three loops, shade, glint,
 * ring, name plate) and, as the frame's SIBLING, the action area with the real widget (the start button). The poster is always there; the
 * loops lie on top of it and change by opacity only.
 *
 * Loading: the poster at once; the idle loop (or a pack's only loop) when the page is idle; the listen and speak loops on the
 * first touch of the card or when a call starts. Poster only with prefers-reduced-motion or Save-Data. Videos pause when the tab is
 * hidden. One format per loop, never both. A video that fails is dropped and the poster stays.
 *
 * Do not put transform, filter, perspective, will-change or contain on this element or on any ancestor of `children`: they turn it into
 * the containing block of the widget's position:fixed form overlay and confine the overlay to the card (see the CSS guard test).
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

export function AgentAvatarCard({ avatar, lang, host, slot = false, placement: pinned, children }: { avatar: ResolvedAvatar; lang?: Language; host?: WidgetHost | null; slot?: boolean; placement?: Placement; children: ReactNode }) {
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
  const overlay = useWidgetOverlay(cardRef);
  const { phase, blocked } = useCallOutcome(useCallStatus(host));
  const { placement, ready } = useCardPlacement(cardRef, slot, pinned, overlay || phase !== "idle");
  const state: CardState = useAgentState(cardRef, host);
  const call = callAttribute(phase);
  const rings = useOrbRings(cardRef, phase);
  // the example call and the status line are for the large card only (the docked card is small, and the circle is the picture)
  const example = placement === "hero" && lang ? (avatar.example?.[lang] ?? null) : null;
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
  // the call bubble: up by the invite loop's clock while that loop plays on screen, never during a call or over the widget's form
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const bubbleOnScreen = bubbleAllowed({ cue: avatar.inviteCue, playing: active === "invite" && Boolean(playing.invite) && visible, callBusy: phase !== "idle", overlay });
  const inviteVideo = useCallback(() => videos.current.invite, []);
  const bubbleText = lang ? bubbleTextOf(avatar, lang) : "";
  useCallBubble(bubbleRef, inviteVideo, avatar.inviteCue, bubbleOnScreen, bubbleText);
  // the job line under the name: the role and the seller's languages (the name is the pack's or the seller's own)
  const roleRef = useRef<HTMLSpanElement>(null);
  const roleFull = lang ? roleLine(avatar, lang) : "";
  const role = useRoleShort(roleRef, roleFull) && lang ? roleLine(avatar, lang, true) : roleFull;

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
    <section ref={cardRef} className="avatar-card" data-block="agent" data-placement={placement} data-ready={ready} data-avatar={avatar.id} data-state={state} data-call={call} data-icon={avatar.buttonIcon} data-rings={rings} aria-label={avatar.name} onPointerDown={touch} onPointerEnter={touch} onFocusCapture={touch}>
      <div ref={frameRef} className="avatar-card__frame">
        <div className="avatar-card__tile">
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
                  preload={slot === "invite" || slot === "idle" || isSingleLoop(avatar) ? "none" : "auto"} // the invite and idle loops start by play(); listen and speak are mounted at the first touch to load now
                  tabIndex={-1}
                  disablePictureInPicture
                  onPlaying={() => setPlaying((p) => ({ ...p, [slot]: true }))}
                  onError={() => setFailed((f) => ({ ...f, [slot]: true }))}
                />
              );
            })}
          </div>
        </div>
        <div className="avatar-card__shade" aria-hidden="true" />
        <span className="avatar-card__glint" aria-hidden="true" data-glint />
        <span className="avatar-card__ring" aria-hidden="true" />
        {placement === "hero" && lang && <AgentCaptions card={cardRef} example={example} name={avatar.name} lang={lang} phase={phase} blocked={blocked} startLabel={startLabelOf(avatar, lang)} liveText={liveTextOf(avatar, lang)} />}
        {placement === "hero" && lang && call === "connected" && (
          <span className="avatar-card__live" aria-hidden="true">
            {ui("agent.label.live", lang)}
          </span>
        )}
        <div className="avatar-card__plate" aria-hidden="true" data-depth="28">
          <span className="avatar-card__name">{avatar.name}</span>
          {role && (
            <span ref={roleRef} className="avatar-card__role">
              {role}
            </span>
          )}
        </div>
      </div>
      {lang && hasBubble(avatar) && (
        // decorative: the call button is the accessible action. Up by the invite loop's clock (use-call-bubble), animated by CSS only.
        <p ref={bubbleRef} className="call-bubble" data-on="false" data-placement={placement} aria-hidden="true">
          <span className="call-bubble__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
          <span className="call-bubble__text">
            <span key={bubbleText} data-typed>{bubbleText}</span>
            <span className="call-bubble__rest" data-rest />
          </span>
        </p>
      )}
      <div className="avatar-card__action">{children}</div>
    </section>
  );
}
