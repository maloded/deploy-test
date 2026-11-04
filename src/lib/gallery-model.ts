// The gallery as data: categories, the one photo sequence, and what an address (a hash) or an agent name points at.
// Pure functions with no React and no Node imports: the schema, the loader, the component and the agent bridge all use them.

export const GALLERY_CATEGORIES = ["exterior", "interior", "details"] as const;
export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

/** Lower-case words joined by single hyphens: "front-side", "mileage-reading". */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type GalleryItemRef = { id: string; aliases?: readonly string[]; category: GalleryCategory; hotspots?: readonly { id: string; aliases?: readonly string[] }[] };

/** The one sequence: exterior, then interior, then details; inside a category the order of the file. Stable, never mutates. */
export function orderGallery<T extends { category: GalleryCategory }>(items: readonly T[]): T[] {
  const rank = (c: GalleryCategory) => GALLERY_CATEGORIES.indexOf(c);
  return items.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item.category) - rank(b.item.category) || a.i - b.i).map((x) => x.item);
}

/** The categories that have photos, in the fixed order. */
export function usedCategories(items: readonly { category: GalleryCategory }[]): GalleryCategory[] {
  return GALLERY_CATEGORIES.filter((c) => items.some((g) => g.category === c));
}

/** Index of the first photo of a category, or -1. */
export function firstOfCategory(items: readonly { category: GalleryCategory }[], category: GalleryCategory): number {
  return items.findIndex((g) => g.category === category);
}

/** Index of the photo with this id or alias, or -1. */
export function indexOfPhoto(items: readonly GalleryItemRef[], name: string): number {
  const byId = items.findIndex((g) => g.id === name);
  return byId >= 0 ? byId : items.findIndex((g) => g.aliases?.includes(name));
}

/** Where a spot is, by its id or an alias: the photo index and the spot's own (canonical) id, or null. */
export function findSpot(items: readonly GalleryItemRef[], name: string): { index: number; spotId: string } | null {
  for (let index = 0; index < items.length; index++) {
    const spot = items[index].hotspots?.find((h) => h.id === name) ?? items[index].hotspots?.find((h) => h.aliases?.includes(name));
    if (spot) return { index, spotId: spot.id };
  }
  return null;
}

/** What an address means for the gallery. `unknown` is a gallery-looking address that names nothing here. */
export type GalleryTarget =
  | { kind: "section" }
  | { kind: "photo"; index: number }
  | { kind: "category"; category: GalleryCategory; index: number }
  | { kind: "spot"; index: number; spotId: string }
  | { kind: "unknown"; reason: string }
  | null;

/**
 * Resolves a hash ("#gallery", "#gallery-interior", "#gallery-7", "#photo-cockpit", "#spot-tyres") against the sequence.
 * null: not a gallery address at all (the caller handles it otherwise). 1-based numbers are the older "#gallery-N".
 */
export function resolveGalleryHash(items: readonly GalleryItemRef[], hash: string): GalleryTarget {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (h === "gallery") return { kind: "section" };
  let rest: string | null = null;
  const m = /^(gallery|photo|spot)-(.*)$/.exec(h);
  if (!m) return null;
  rest = m[2];
  if (m[1] === "gallery") {
    if ((GALLERY_CATEGORIES as readonly string[]).includes(rest)) {
      const category = rest as GalleryCategory;
      const index = firstOfCategory(items, category);
      return index >= 0 ? { kind: "category", category, index } : { kind: "unknown", reason: `no photo in the category "${category}"` };
    }
    if (/^[1-9]\d*$/.test(rest)) {
      const n = Number(rest);
      return n <= items.length ? { kind: "photo", index: n - 1 } : { kind: "unknown", reason: `photo ${n} of ${items.length}` };
    }
    return { kind: "unknown", reason: `"${rest}" is neither a category nor a photo number` };
  }
  if (m[1] === "photo") {
    const index = indexOfPhoto(items, rest);
    if (index >= 0) return { kind: "photo", index };
    // a name that is no photo but a spot opens that spot (the photo with its card): "#photo-seats"
    const spot = findSpot(items, rest);
    return spot ? { kind: "spot", ...spot } : { kind: "unknown", reason: `no photo "${rest}"` };
  }
  const spot = findSpot(items, rest);
  return spot ? { kind: "spot", ...spot } : { kind: "unknown", reason: `no spot "${rest}"` };
}

/** The address that names a photo (its id), a spot, or a category: what the page writes for API-driven changes. */
export const photoHash = (id: string) => `#photo-${id}`;
export const spotHash = (id: string) => `#spot-${id}`;
export const categoryHash = (c: GalleryCategory) => `#gallery-${c}`;
