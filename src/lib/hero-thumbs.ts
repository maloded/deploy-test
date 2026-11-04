// The thumbnails beside the hero photo. Pure (no file access), so the client island can import the constants too.
/** The most thumbnails beside the hero photo. */
export const HERO_THUMBS = 2;
/** The narrowest the thumbnail column may be, in rem: with less room than this there are no thumbnails. */
export const HERO_THUMB_MIN_REM = 6;

export type HeroThumb = { n: number; src: string; width: number; height: number; alt: string; position: string | undefined; /** The tile shows a cut-out (transparent): the theme paints its backdrop. */ cutout: boolean };
type ThumbSlide = { src: string; width: number; height: number; alt: string; position: string | undefined; cutout?: { src: string; width: number; height: number } | null };

/**
 * The thumbnails beside the hero photo: the next gallery photos after the hero one (the slide whose file, or whose cut-out, is the hero's; when the hero
 * photo is not in the gallery, the first ones), with their own alt texts. A slide that has a cut-out is shown by it. `n` is the photo's 1-based number in
 * the gallery, as in the deep link #gallery-<n>.
 */
export function heroThumbs(slides: readonly ThumbSlide[], heroSrc: string | undefined): HeroThumb[] {
  const at = heroSrc ? slides.findIndex((s) => s.src === heroSrc || s.cutout?.src === heroSrc) : -1;
  return slides.slice(at + 1, at + 1 + HERO_THUMBS).map((s, i) => {
    const shown = s.cutout ?? s;
    return { n: at + 2 + i, src: shown.src, width: shown.width, height: shown.height, alt: s.alt, position: s.cutout ? undefined : s.position, cutout: Boolean(s.cutout) };
  });
}
