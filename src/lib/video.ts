export type ParsedVideo =
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string }
  | { kind: "file"; file: string; type: "video/mp4" | "video/webm" };

const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{5,}$/;
const HELP = "Use a YouTube or Vimeo URL, or an mp4/webm file name in media/";

/** Parses media.video. Returns the parsed video, or a one-line problem to show to the author. */
export function parseVideo(value: string): ParsedVideo | { error: string } {
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { error: `not a valid URL "${value}". ${HELP}` };
    }
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    let id: string | undefined;

    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = parts[0] === "watch" ? (url.searchParams.get("v") ?? undefined) : ["embed", "shorts", "live", "v"].includes(parts[0]) ? parts[1] : undefined;
    } else if (host === "youtu.be") {
      id = parts[0];
    } else if (host === "vimeo.com" || host === "player.vimeo.com") {
      id = parts[0] === "video" ? parts[1] : parts[0];
      if (id && VIMEO_ID.test(id)) return { kind: "vimeo", id };
      return { error: `no Vimeo video id in "${value}". ${HELP}` };
    } else {
      return { error: `unknown video host "${url.hostname}". ${HELP}` };
    }
    if (id && YOUTUBE_ID.test(id)) return { kind: "youtube", id };
    return { error: `no YouTube video id in "${value}". ${HELP}` };
  }

  if (/^[^/\\]+\.mp4$/i.test(value)) return { kind: "file", file: value, type: "video/mp4" };
  if (/^[^/\\]+\.webm$/i.test(value)) return { kind: "file", file: value, type: "video/webm" };
  return { error: `"${value}" is not a URL or an mp4/webm file name. ${HELP}` };
}

/** Embed address of a click-to-load facade. Privacy-friendly domains; autoplay only after the user's click. */
export function embedUrl(video: Extract<ParsedVideo, { kind: "youtube" | "vimeo" }>): string {
  return video.kind === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${video.id}?dnt=1&autoplay=1`;
}
