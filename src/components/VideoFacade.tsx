"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Language } from "@/lib/schema";
import { ui } from "@/lib/ui-strings";

export type FacadeProps = {
  /** Address of the embed (youtube-nocookie.com or player.vimeo.com with dnt=1). Loaded only after a click. */
  embed: string;
  title: string;
  lang: Language;
  poster: { src: string; width: number; height: number } | null;
};

/**
 * Click-to-load video: a poster (a local file, never a remote thumbnail) and a play button. The iframe,
 * and with it every third-party request, appears only after the click. Autoplay happens only as the
 * direct result of that click.
 */
export function VideoFacade({ embed, title, lang, poster }: FacadeProps) {
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (loaded) frame.current?.focus();
  }, [loaded]);

  if (loaded) {
    return (
      <iframe
        ref={frame}
        className="video__embed"
        src={embed}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <button type="button" className="video__facade" aria-label={`${ui("video.play", lang)}: ${title}`} onClick={() => setLoaded(true)}>
      {poster && <Image className="video__poster" src={poster.src} width={poster.width} height={poster.height} alt="" sizes="(min-width: 56em) 1100px, 100vw" />}
      <span className="video__play" aria-hidden="true" />
    </button>
  );
}
