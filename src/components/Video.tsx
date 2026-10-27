import { pick } from "@/lib/i18n";
import { embedUrl, parseVideo } from "@/lib/video";
import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";
import { VideoFacade } from "./VideoFacade";

/**
 * Video block. YouTube and Vimeo use a click-to-load facade (no third-party request before the click).
 * A local mp4/webm file uses a plain <video> with controls; it never autoplays.
 */
export function Video({ site }: { site: Site }) {
  const { product, images } = site;
  const lang = product.defaultLanguage;
  const source = product.media.video;
  if (!source) return null;
  const video = parseVideo(source);
  if ("error" in video) return null; // already rejected by validation

  const posterFile = product.media.videoPoster;
  const poster = posterFile ? images[posterFile] : undefined;
  const title = `${ui("video.player", lang)}: ${pick(product.title, lang)}`;

  return (
    <section className="video" id="video" data-block="video" aria-label={ui("section.video", lang)}>
      <div className="container">
        <div className="video__frame">
          {video.kind === "file" ? (
            <video className="video__file" controls preload="metadata" playsInline poster={poster?.src} aria-label={title}>
              <source src={`/media/${site.ref}/${video.file}`} type={video.type} />
              {ui("video.unsupported", lang)}
            </video>
          ) : (
            <VideoFacade embed={embedUrl(video)} title={title} lang={lang} poster={poster ?? null} />
          )}
        </div>
      </div>
    </section>
  );
}
