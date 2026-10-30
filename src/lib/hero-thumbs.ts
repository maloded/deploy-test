// The thumbnails beside the hero photo. Pure (no file access), so the client island can import the constants too.
/** The most thumbnails beside the hero photo. */
export const HERO_THUMBS = 2;
/** The narrowest the thumbnail column may be, in rem: with less room than this there are no thumbnails. */
export const HERO_THUMB_MIN_REM = 6;

export type HeroThumb = { n: number; src: string; width: number; height: number; alt: string; position: string | undefined };

/**
 * The thumbnails beside the hero photo: the next gallery photos after the hero one (the slide whose file is the hero's; when the hero photo is not
 * in the gallery, the first ones), with their own alt texts. `n` is the photo's 1-based number in the gallery, as in the deep link #gallery-<n>.
 */
export function heroThumbs(slides: readonly { src: string; width: number; height: number; alt: string; position: string | undefined }[], heroSrc: string | undefined): HeroThumb[] {
  const at = heroSrc ? slides.findIndex((s) => s.src === heroSrc) : -1;
  return slides.slice(at + 1, at + 1 + HERO_THUMBS).map((s, i) => ({ n: at + 2 + i, ...s }));
}
