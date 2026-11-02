"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { findWidget, watchCallStatus } from "@/lib/hanc-bridge";
import { FADE_MS } from "@/lib/music";
import { fadeVolume } from "@/lib/music-fade";
import { getVolume, setVolume, subscribeVolume } from "@/lib/music-volume";
import type { Language } from "@/lib/schema";
import { ui, uiFmt } from "@/lib/ui-strings";

export type PlayerTrack = { id: string; title: string; src: string };

const noSubscription = () => () => {};

/**
 * The background music player (rendered by the header, only for a product with a `music` object).
 *
 * - Off until the visitor presses play: there is no autoplay and no other way to start it, on this visit or the next. Nothing is
 *   requested from the network before the first start: the audio element is made then, with preload "none".
 * - Starting and stopping fade for FADE_MS; a hidden tab pauses at once. Nothing resumes the music by itself.
 * - A voice call with the assistant (connecting or connected) fades the music out and pauses it, and the music stays paused after the
 *   call: the visitor presses play again if they want it. The call is read through the bridge (call status and the call-start event);
 *   the player never writes to the widget. Started by hand in the middle of a call, the music is left alone until the next call.
 * - The header shows ONE equalizer icon (accent-coloured while playing). It opens a popover with everything: the round play/pause
 *   button, the track title with "n of N" and a next-track button, mute, the volume slider with its percent, and a note that the
 *   music pauses by itself when the visitor talks to the assistant. Escape or a press outside closes it and gives the focus back to the icon.
 * - The volume (the slider, and a mute button that keeps it) is the one thing remembered, in localStorage (try/catch). Mute is for
 *   this page view only.
 */
export function MusicPlayer({ lang, tracks, defaultTrack, volume: defaultVolume, assistantName }: { lang: Language; tracks: PlayerTrack[]; defaultTrack: string; volume: number; assistantName?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopFade = useRef<(() => void) | null>(null);
  const playingRef = useRef(false);
  /** The level the audio element should have while it plays: the volume, or 0 when muted. */
  const levelRef = useRef(0);
  const [trackId, setTrackId] = useState(defaultTrack);
  const trackRef = useRef(defaultTrack);
  const [playing, setPlayingState] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  // the stored volume (null: none, the product's default applies); the server's HTML always shows the default
  const stored = useSyncExternalStore(subscribeVolume, () => getVolume(), () => null);
  const volume = stored ?? defaultVolume;
  // false in the server's HTML and the first client render: the controls are inert until the page runs
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);

  const setPlaying = useCallback((value: boolean) => {
    playingRef.current = value;
    setPlayingState(value);
  }, []);

  const srcOf = useCallback((id: string) => tracks.find((t) => t.id === id)?.src ?? tracks[0].src, [tracks]);

  const fadeTo = useCallback((level: number, done?: () => void) => {
    stopFade.current?.();
    stopFade.current = audioRef.current ? fadeVolume(audioRef.current, level, FADE_MS, done) : null;
  }, []);

  /** The audio element, made at the first start. */
  const audio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "none";
      a.loop = true;
      a.volume = 0;
      a.addEventListener("error", () => {
        stopFade.current?.();
        setPlaying(false);
        setFailed(true); // a 404 or an unsupported file
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }, [setPlaying]);

  /** Starts the current track, fading in. Runs synchronously up to play(), so it can be the body of a click handler. Never throws. */
  const start = useCallback(() => {
    try {
      const a = audio();
      const src = srcOf(trackRef.current);
      if (!a.src || !a.src.endsWith(src)) a.src = src;
      setFailed(false);
      stopFade.current?.();
      if (a.paused) a.volume = 0; // a fresh start is silent and fades in; a pause that is still fading out simply turns back up
      const result = a.play();
      setPlaying(true);
      fadeTo(levelRef.current);
      Promise.resolve(result).catch(() => {
        stopFade.current?.();
        setPlaying(false); // refused (policy) or not playable
        setFailed(true);
      });
    } catch {
      setPlaying(false);
      setFailed(true);
    }
  }, [audio, srcOf, setPlaying, fadeTo]);

  /** Pauses: fading out for FADE_MS (the button shows "paused" at once), or at once when `fade` is false. */
  const pause = useCallback(
    (fade: boolean) => {
      setPlaying(false);
      const a = audioRef.current;
      if (!a) return;
      stopFade.current?.();
      if (!fade || a.paused) {
        a.pause();
        return;
      }
      fadeTo(0, () => a.pause());
    },
    [setPlaying, fadeTo],
  );

  const toggle = () => {
    if (playingRef.current) pause(true);
    else start();
  };

  const choose = (id: string) => {
    trackRef.current = id;
    setTrackId(id);
    if (!playingRef.current) return; // while paused only the choice changes; the file is requested at the next start
    const a = audio();
    a.pause();
    a.src = srcOf(id);
    start();
  };

  // the slider and the mute act at once while the music plays (only a start and a stop fade); a fade in progress is replaced
  useEffect(() => {
    levelRef.current = muted ? 0 : volume;
    if (playingRef.current && audioRef.current) {
      stopFade.current?.();
      audioRef.current.volume = levelRef.current;
    }
  }, [muted, volume]);

  // a hidden tab pauses the music and nothing resumes it
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && playingRef.current) pause(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  // a call with the assistant stops the music (fading out) and nothing starts it again; only while it plays, so nothing is watched otherwise
  useEffect(() => {
    if (!playing) return;
    const onCall = () => {
      if (playingRef.current) pause(true);
    };
    const host = findWidget(document);
    let armed = false; // the status at the moment the music starts is not "a call began": a call that is already running is left alone
    const stopWatching = host
      ? watchCallStatus(host, (status) => {
          if (armed && (status === "connecting" || status === "connected")) onCall();
        })
      : undefined;
    armed = true;
    document.addEventListener("call-start", onCall);
    return () => {
      stopWatching?.();
      document.removeEventListener("call-start", onCall);
    };
  }, [playing, pause]);

  // the popover closes with Escape or a press outside the player
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLElement>(".music__toggle")?.focus();
      }
    };
    const onPress = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open]);

  useEffect(
    () => () => {
      stopFade.current?.();
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const onSlider = (value: number) => {
    setVolume(value);
    if (muted && value > 0) setMuted(false); // moving the slider is asking to hear it
  };
  const percent = Math.round((muted ? 0 : volume) * 100);
  const index = Math.max(0, tracks.findIndex((t) => t.id === trackId));
  const current = tracks[index] ?? tracks[0];
  const next = () => choose(tracks[(index + 1) % tracks.length].id);

  return (
    <div ref={rootRef} className="music" data-playing={playing ? "true" : "false"} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="music__toggle"
        aria-expanded={open}
        aria-controls="music-panel"
        aria-label={ui(playing ? "music.open.playing" : "music.open", lang)}
        disabled={!ready}
        onClick={() => setOpen((o) => !o)}
      >
        <EqualizerIcon />
      </button>
      <div id="music-panel" className="music__panel" role="group" aria-label={ui("music.group", lang)}>
        {/* a two-column grid: column 1 is one control wide (play/pause, and under it mute), column 2 the rest (title and next, then the slider and its percent) */}
        <button type="button" className="music__button" aria-pressed={playing} aria-label={ui(playing ? "music.pause" : "music.play", lang)} disabled={!ready} onClick={toggle}>
          {playing ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false">
              <rect x="6" y="5" width="4" height="14" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" fill="currentColor" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="music__now">
          <div className="music__track">
            <span className="music__title">{current.title}</span>
            {tracks.length > 1 && <span className="music__position">{uiFmt("music.position", lang, { n: index + 1, total: tracks.length })}</span>}
          </div>
          {tracks.length > 1 && (
            <button type="button" className="music__next" aria-label={ui("music.next", lang)} disabled={!ready} onClick={next}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false" fill="currentColor">
                <path d="M6 5v14l9-7zM17 5h2v14h-2z" />
              </svg>
            </button>
          )}
        </div>
        <button type="button" className="music__mute" aria-pressed={muted} aria-label={ui("music.mute", lang)} disabled={!ready} onClick={() => setMuted((m) => !m)}>
          <SpeakerIcon level={percent} />
        </button>
        <div className="music__volume" role="group" aria-label={ui("music.volume", lang)}>
          <input
            type="range"
            className="music__slider"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            aria-label={ui("music.volume", lang)}
            aria-valuetext={`${Math.round(volume * 100)}%`}
            style={{ "--music-fill": `${Math.round(volume * 100)}%` } as React.CSSProperties}
            disabled={!ready}
            onChange={(e) => onSlider(Number(e.target.value) / 100)}
          />
          <span className="music__percent" aria-hidden="true">
            {Math.round(volume * 100)}%
          </span>
        </div>
        {assistantName && <p className="music__note">{uiFmt("music.note", lang, { name: assistantName })}</p>}
        {failed && (
          <p className="music__error" role="status">
            {ui("music.error", lang)}
          </p>
        )}
      </div>
    </div>
  );
}

/** Equalizer bars: the music icon of the header. */
function EqualizerIcon() {
  return (
    <svg className="music__eq" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" focusable="false" fill="currentColor">
      <rect className="music__bar music__bar--1" x="3.5" y="9" width="3.5" height="11" rx="1.2" />
      <rect className="music__bar music__bar--2" x="10.25" y="4" width="3.5" height="16" rx="1.2" />
      <rect className="music__bar music__bar--3" x="17" y="12" width="3.5" height="8" rx="1.2" />
    </svg>
  );
}

/** A speaker; muted (level 0) shows a cross, otherwise one or two waves by the level. */
function SpeakerIcon({ level }: { level: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {level === 0 ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 9.5a4 4 0 0 1 0 5" />}
      {level > 50 && <path d="M18.5 7a8 8 0 0 1 0 10" />}
    </svg>
  );
}
