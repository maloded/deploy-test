import fs from "node:fs";
import path from "node:path";
import { shortTitle } from "./brand";
import type { ProductTypeFields } from "./fields";
import { pick } from "./i18n";
import type { Language, Localized, Product } from "./schema";
import { THEMES_DIR } from "./themes";

export type HeroFact = { value: string; label: string };

/** Eyebrow line: hero.eyebrow items (for example the place) and then the offer type label, joined with " · ". */
export function heroEyebrow(product: Product, lang: Language, offerLabel: Localized): string {
  return [...(product.hero?.eyebrow ?? []).map((i) => pick(i, lang)), pick(offerLabel, lang)].join(" · ");
}

/** The big line: hero.headline, else the short form of the title (never a parenthetical such as "(ref. 123)"). */
export function heroHeadline(product: Product, lang: Language): string {
  const headline = product.hero?.headline;
  return headline ? pick(headline, lang) : shortTitle(pick(product.title, lang));
}

/** Description: hero.description, else the tagline. */
export function heroDescription(product: Product, lang: Language): string {
  const description = product.hero?.description;
  return pick(description ?? product.tagline, lang);
}

/**
 * A spec value made short enough for a large display: the part before " (" or ",", so "150 kW (204 PS)"
 * becomes "150 kW". Units stay (they are part of the value text).
 */
export function shortValue(value: string): string {
  return value.split(/\s+\(|,\s+/)[0].trim() || value;
}

/**
 * Key facts: hero.highlights when set, otherwise the product type's hero spec keys that exist in the specs
 * (value with its unit, label in the page language). At most 4; an empty list means no strip.
 */
export function heroFacts(product: Product, type: ProductTypeFields, lang: Language): HeroFact[] {
  const keys = product.hero?.highlights ?? type.heroHighlights;
  return keys
    .flatMap((key) => product.specs.filter((s) => s.key === key))
    .slice(0, 4)
    .map((s) => ({ value: shortValue(pick(s.value, lang)), label: pick(s.label, lang) }));
}

/** Trust items shown as one thin line under the intro row. */
export function heroTrust(product: Product, lang: Language): string[] {
  return (product.hero?.trust ?? []).map((t) => pick(t, lang));
}

/** The ratios the hero frame may take: its width/height ratio always stays inside [min, max]. */
export type FrameRange = { min: number; max: number };
export const DEFAULT_FRAME_RANGE: FrameRange = { min: 1, max: 16 / 9 };

/** A ratio written as a number ("1.7778") or as "16 / 9". */
function parseRatio(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*$/.exec(text);
  if (!m) return undefined;
  const value = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  return value > 0 ? value : undefined;
}

/** --hero-frame-min-ratio and --hero-frame-max-ratio from a theme's CSS, with the defaults 1 and 16/9. */
export function frameRatioRange(css: string | undefined, theme: string): FrameRange {
  if (!css) return DEFAULT_FRAME_RANGE;
  const block = new RegExp(`:root\\[data-theme=["']${theme}["']\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const read = (name: string) => parseRatio(new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(block)?.[1]);
  const min = read("--hero-frame-min-ratio") ?? DEFAULT_FRAME_RANGE.min;
  const max = read("--hero-frame-max-ratio") ?? DEFAULT_FRAME_RANGE.max;
  return min <= max ? { min, max } : DEFAULT_FRAME_RANGE;
}

export function frameRangeForTheme(theme: string): FrameRange {
  try {
    return frameRatioRange(fs.readFileSync(/*turbopackIgnore: true*/ path.join(THEMES_DIR, `${theme}.css`), "utf8"), theme);
  } catch {
    return DEFAULT_FRAME_RANGE;
  }
}

export type HeroFit = "cover" | "contain";

/** The photo ratio may differ from a frame ratio by up to 15% before it is shown whole (contain) on a matte. */
export const FIT_TOLERANCE = 0.15;

/**
 * Deterministic fit, decided from the photo's display size alone: the frame ratio varies with the window inside
 * [min, max], so use "contain" when the photo ratio is outside [min x 0.85, max x 1.15], else "cover".
 */
export function heroFit(width: number, height: number, range: FrameRange): HeroFit {
  const ratio = width / height;
  return ratio < range.min * (1 - FIT_TOLERANCE) || ratio > range.max * (1 + FIT_TOLERANCE) ? "contain" : "cover";
}
