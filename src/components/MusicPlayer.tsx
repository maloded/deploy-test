"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Autostart } from "@/lib/music";
import type { Language } from "@/lib/schema";
import { ui } from "@/lib/ui-strings";

export type PlayerTrack = { id: string; title: string; src: string };

const noSubscription = () => () => {};
/** The first gesture that may start the music when autostart is "gesture". */
const GESTURES = ["pointerdown", "touchend", "keydown"] as const;

/**
 * The background music player (rendered by the header, only for a product with a `music` object). It does not know the
 * voice assistant: it never listens to it and never pauses or ducks for a call. Nothing is requested from the network before
 * the music starts: the audio element is created at the first start, with preload "none". State lives in memory for this
 * page view only (no storage, no cookie).
 *
 * autostart "gesture": ONE handler, registered for pointerdown, touchend and keydown, starts the music inside the first
 * gesture (a browser only allows sound after one) and removes itself. A gesture on the player itself is left to its own
 * button. If play() is refused the player shows "paused" and does not try again. Once the visitor has paused the music it never
 * starts by itself again. Not with navigator.connection.saveData.
 */
export function MusicPlayer({ lang, tracks, defaultTrack, volume, autostart }: { lang: Language; tracks: PlayerTrack[]; defaultTrack: string; volume: number; autostart: Autostart }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** The visitor paused the music with the player: no automatic start any more. */
  const pausedByVisitor = useRef(false);
  const playingRef = useRef(false);
  const [trackId, setTrackId] = useState(defaultTrack);
  const trackRef = useRef(defaultTrack);
  const [playing, setPlayingState] = useState(false);
  const [failed, setFailed] = useState(false);
  // false in the server's HTML and the first client render: the button is inert until the page runs
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);

  const setPlaying = useCallback((value: boolean) => {
    playingRef.current = value;
    setPlayingState(value);
  }, []);

  const srcOf = useCallback((id: string) => tracks.find((t) => t.id === id)?.src ?? tracks[0].src, [tracks]);

  /** The audio element, made at the first start. */
  const audio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "none";
      a.loop = true;
      a.volume = volume;
      a.addEventListener("error", () => {
        setPlaying(false);
        setFailed(true); // a 404 or an unsupported file
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }, [volume, setPlaying]);

  /** Starts the current track. Runs synchronously up to play(), so it can be the body of a gesture handler. Never throws. */
  const start = useCallback(
    (visible: boolean) => {
      try {
        const a = audio();
        const src = srcOf(trackRef.current);
        if (!a.src || !a.src.endsWith(src)) a.src = src;
        setFailed(false);
        const result = a.play();
        setPlaying(true);
        Promise.resolve(result).catch(() => {
          setPlaying(false); // refused (policy) or not playable: shown as paused, never retried
          if (visible) setFailed(true);
        });
      } catch {
        setPlaying(false);
        if (visible) setFailed(true);
      }
    },
    [audio, srcOf, setPlaying],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [setPlaying]);

  const toggle = () => {
    if (playingRef.current) {
      pausedByVisitor.current = true;
      pause();
    } else {
      pausedByVisitor.current = false;
      start(true);
    }
  };

  const choose = (id: string) => {
    trackRef.current = id;
    setTrackId(id);
    if (!playingRef.current) return; // while paused only the choice changes; the file is requested at the next start
    const a = audio();
    a.pause();
    a.src = srcOf(id);
    start(true);
  };

  // the one automatic start
  useEffect(() => {
    if (autostart !== "gesture") return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saveData) return;
    const onGesture = (e: Event) => {
      for (const type of GESTURES) document.removeEventListener(type, onGesture);
      if (rootRef.current?.contains(e.target as Node | null)) return; // the visitor is using the player: its own button decides
      if (pausedByVisitor.current || playingRef.current) return;
      start(false);
    };
    for (const type of GESTURES) document.addEventListener(type, onGesture, { passive: true });
    return () => {
      for (const type of GESTURES) document.removeEventListener(type, onGesture);
    };
  }, [autostart, start]);

  // a hidden tab pauses the music and nothing resumes it
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && playingRef.current) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  return (
    <div ref={rootRef} className="music" role="group" aria-label={ui("music.group", lang)} data-playing={playing ? "true" : "false"}>
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
      {tracks.length > 1 && (
        <select className="music__select" aria-label={ui("music.track", lang)} value={trackId} disabled={!ready} onChange={(e) => choose(e.target.value)}>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}
      {failed && (
        <span className="music__error" role="status">
          {ui("music.error", lang)}
        </span>
      )}
    </div>
  );
}
