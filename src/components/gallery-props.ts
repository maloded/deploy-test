import { objectPosition } from "@/lib/focus";
import { pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import { orderGallery, type GalleryCategory } from "@/lib/gallery-model";
import type { Site } from "./blocks";

export type SpotFact = { label: string; value: string };
export type GallerySpot = { id: string; aliases: string[]; x: number; y: number; label: string; facts: SpotFact[]; text: string | null };
export type GallerySlide = {
  id: string;
  aliases: string[];
  category: GalleryCategory;
  src: string;
  width: number;
  height: number;
  alt: string;
  /** The short text under the photo; the alt text when the content has none. */
  caption: string;
  position: string | undefined;
  /** The cut-out of the photo, when the content has one (the hero's tiles show it instead of the photo). */
  cutout: { src: string; width: number; height: number } | null;
  spots: GallerySpot[];
};

/**
 * Serializable props for the client gallery. The photos are in THE sequence (exterior, interior, details; the order of the file inside
 * a category), which is also what the numbers of #gallery-<n> count. Photos whose file is missing (dev only) are left out.
 * A spot's facts come from the specs (a figure lives in one place), then its own rows, and its own text is added to them.
 */
export function galleryProps(site: Site) {
  const { product, images } = site;
  const { lang } = site;
  const slides: GallerySlide[] = orderGallery(product.media.gallery).flatMap((g) => {
    const image = images[g.file];
    if (!image) return [];
    const alt = pick(g.alt, lang);
    const spots: GallerySpot[] = (g.hotspots ?? []).map((h) => ({
      id: h.id,
      aliases: h.aliases ?? [],
      x: h.x,
      y: h.y,
      label: pick(h.label, lang),
      facts: [
        ...(h.specKeys ?? []).flatMap((key) => product.specs.filter((s) => s.key === key)).map((s) => ({ label: pick(s.label, lang), value: pick(s.value, lang) })),
        ...(h.facts ?? []).map((f) => ({ label: pick(f.label, lang), value: pick(f.value, lang) })),
      ],
      text: h.text ? pick(h.text, lang) : null,
    }));
    return [{ id: g.id, aliases: g.aliases ?? [], category: g.category, src: image.src, width: image.width, height: image.height, alt, caption: g.caption ? pick(g.caption, lang) : alt, position: objectPosition(g.focus), cutout: g.cutout && images[g.cutout] ? { src: images[g.cutout].src, width: images[g.cutout].width, height: images[g.cutout].height } : null, spots }];
  });
  return { slides, lang, autoplaySeconds: product.gallery?.autoplaySeconds ?? null, categoryLabels: categoryLabels(site) };
}

const DEFAULT_LABEL_KEYS = { exterior: "gallery.category.exterior", interior: "gallery.category.interior", details: "gallery.category.details" } as const;

/** Names of the three categories in the page language: the content's override (gallery.categoryLabels) or the ui strings. */
function categoryLabels(site: Site): Record<GalleryCategory, string> {
  const override = site.product.gallery?.categoryLabels;
  const out = {} as Record<GalleryCategory, string>;
  for (const c of ["exterior", "interior", "details"] as const) out[c] = override?.[c] ? pick(override[c], site.lang) : ui(DEFAULT_LABEL_KEYS[c], site.lang);
  return out;
}
