// The Open Graph image: gallery photo 1, cropped to 1200x630 by `npm run images` (scripts/lib/web-images.mjs) and served from public/media.
// Self-contained (the images script imports it with a .ts extension). Never enlarged: a photo smaller than 1200x630 gives no image.
import fs from "node:fs";
import path from "node:path";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_IMAGE_FILE = "og-1200x630.jpg";

/**
 * How to cut 1200x630 out of a photo of srcWidth x srcHeight: scale it to cover (never up), then take the window around `focus` (0..1, default
 * the centre; the same focus the gallery uses). null when the photo is smaller than 1200x630 in either direction.
 */
export function ogCropBox(srcWidth: number, srcHeight: number, focus: { x: number; y: number } = { x: 0.5, y: 0.5 }): { width: number; height: number; left: number; top: number } | null {
  if (srcWidth < OG_WIDTH || srcHeight < OG_HEIGHT) return null;
  const scale = Math.max(OG_WIDTH / srcWidth, OG_HEIGHT / srcHeight);
  const width = Math.max(OG_WIDTH, Math.round(srcWidth * scale));
  const height = Math.max(OG_HEIGHT, Math.round(srcHeight * scale));
  const clamp = (v: number, max: number) => Math.min(Math.max(Math.round(v), 0), max);
  return { width, height, left: clamp(focus.x * width - OG_WIDTH / 2, width - OG_WIDTH), top: clamp(focus.y * height - OG_HEIGHT / 2, height - OG_HEIGHT) };
}

/** The public path of the product's OG image when the images step made one, else null (no image, no broken URL). */
export function ogImagePath(ref: string, projectRoot: string = process.cwd()): string | null {
  return fs.existsSync(/*turbopackIgnore: true*/ path.join(projectRoot, "public", "media", ref, OG_IMAGE_FILE)) ? `/media/${ref}/${OG_IMAGE_FILE}` : null;
}
