import { objectPosition } from "@/lib/focus";
import { pick } from "@/lib/i18n";
import type { Site } from "./blocks";

export type GallerySlide = { src: string; width: number; height: number; alt: string; position: string | undefined };

/** Serializable props for the client gallery. Photos whose file is missing (dev only) are left out. */
export function galleryProps(site: Site) {
  const { product, images } = site;
  const lang = product.defaultLanguage;
  const slides: GallerySlide[] = product.media.gallery.flatMap((g) => {
    const image = images[g.file];
    return image
      ? [{ src: image.src, width: image.width, height: image.height, alt: pick(g.alt, lang), position: objectPosition(g.focus) }]
      : [];
  });
  return { slides, lang, autoplaySeconds: product.gallery?.autoplaySeconds ?? null };
}
