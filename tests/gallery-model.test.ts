import { describe, expect, it } from "vitest";
import { findSpot, firstOfCategory, indexOfPhoto, orderGallery, resolveGalleryHash, usedCategories, SLUG_PATTERN, type GalleryItemRef } from "@/lib/gallery-model";
import { validateProduct } from "@/lib/validate";
import { examples } from "./helpers";

const SEQ: GalleryItemRef[] = [
  { id: "front", category: "exterior" },
  { id: "rear", aliases: ["back"], category: "exterior" },
  { id: "cabin", category: "interior", hotspots: [{ id: "seats" }, { id: "roof" }] },
  { id: "cockpit", aliases: ["steering-wheel-panel"], category: "interior" },
  { id: "mileage", category: "details", hotspots: [{ id: "mileage-reading" }] },
];

describe("orderGallery", () => {
  it("puts exterior, then interior, then details; inside a category the order of the file; never mutates", () => {
    const input = [
      { id: "a", category: "details" as const },
      { id: "b", category: "interior" as const },
      { id: "c", category: "exterior" as const },
      { id: "d", category: "interior" as const },
      { id: "e", category: "exterior" as const },
    ];
    const copy = structuredClone(input);
    expect(orderGallery(input).map((g) => g.id)).toEqual(["c", "e", "b", "d", "a"]);
    expect(input).toEqual(copy);
  });
  it("lists the used categories in the fixed order and the first photo of each", () => {
    expect(usedCategories([{ category: "details" }, { category: "exterior" }])).toEqual(["exterior", "details"]);
    expect(firstOfCategory(SEQ, "interior")).toBe(2);
    expect(firstOfCategory(SEQ.slice(0, 2), "details")).toBe(-1);
  });
});

describe("ids and aliases", () => {
  it("resolve a photo by id or alias, and a spot to its photo", () => {
    expect(indexOfPhoto(SEQ, "cockpit")).toBe(3);
    expect(indexOfPhoto(SEQ, "steering-wheel-panel")).toBe(3);
    expect(indexOfPhoto(SEQ, "back")).toBe(1);
    expect(indexOfPhoto(SEQ, "nope")).toBe(-1);
    expect(findSpot(SEQ, "roof")).toEqual({ index: 2, spotId: "roof" });
    expect(findSpot(SEQ, "front")).toBeNull();
  });
  it("slugs are lower-case words joined by single hyphens", () => {
    for (const ok of ["front", "front-side", "a1", "mileage-reading"]) expect(SLUG_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ["Front", "front_side", "-front", "front-", "a--b", "a b", ""]) expect(SLUG_PATTERN.test(bad), bad).toBe(false);
  });
});

describe("resolveGalleryHash: every address of the API table", () => {
  const r = (h: string) => resolveGalleryHash(SEQ, h);
  it("the section", () => expect(r("#gallery")).toEqual({ kind: "section" }));
  it("a category: its first photo", () => {
    expect(r("#gallery-exterior")).toEqual({ kind: "category", category: "exterior", index: 0 });
    expect(r("#gallery-interior")).toEqual({ kind: "category", category: "interior", index: 2 });
    expect(r("#gallery-details")).toEqual({ kind: "category", category: "details", index: 4 });
  });
  it("the older number alias, 1-based", () => {
    expect(r("#gallery-1")).toEqual({ kind: "photo", index: 0 });
    expect(r("#gallery-5")).toEqual({ kind: "photo", index: 4 });
  });
  it("a photo by id or alias", () => {
    expect(r("#photo-cockpit")).toEqual({ kind: "photo", index: 3 });
    expect(r("#photo-back")).toEqual({ kind: "photo", index: 1 });
  });
  it("a spot: its photo and the spot", () => expect(r("#spot-seats")).toEqual({ kind: "spot", index: 2, spotId: "seats" }));
  it("unknown names are reported, never silently mapped", () => {
    for (const h of ["#gallery-6", "#gallery-0", "#gallery-01", "#gallery-garden", "#photo-nope", "#spot-nope", "#spot-cockpit", "#photo-"]) {
      expect(r(h), h).toMatchObject({ kind: "unknown" });
    }
  });
  it("addresses that are not the gallery's are null", () => {
    for (const h of ["#contact", "#top", "#specs", "#galleryx", "", "#"]) expect(r(h), h).toBeNull();
  });
  it("a category with no photo is unknown", () => expect(resolveGalleryHash(SEQ.slice(0, 2), "#gallery-details")).toMatchObject({ kind: "unknown" }));
});

describe("the schema checks of the gallery", () => {
  const base = () => structuredClone(examples.sampleJson("example-watch")) as { media: { gallery: unknown[] } };
  const issues = (p: unknown) => {
    const v = validateProduct(p);
    return v.ok ? [] : v.issues;
  };
  const photo = (id: string, extra: object = {}) => ({ id, category: "exterior", file: "hero.png", alt: { en: id }, ...extra });

  it("needs an id and a category on every photo, and a known category", () => {
    const p = base();
    p.media.gallery = [{ file: "hero.png", alt: { en: "x" } }];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.0\.id/);
    p.media.gallery = [photo("a", { category: "outside" })];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.0\.category/);
  });
  it("rejects duplicate ids, an alias equal to an id, and a duplicate alias", () => {
    const p = base();
    p.media.gallery = [photo("a"), photo("a")];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.1\.id: "a" is already used by media\.gallery\.0\.id/);
    p.media.gallery = [photo("a"), photo("b", { aliases: ["a"] })];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.1\.aliases\.0: "a" is already used/);
    p.media.gallery = [photo("a", { aliases: ["x"] }), photo("b", { aliases: ["x"] })];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.1\.aliases\.0: "x" is already used/);
  });
  it("rejects a malformed slug", () => {
    const p = base();
    p.media.gallery = [photo("Front Side")];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.0\.id.*slug/);
  });
  it("spot ids are unique across the whole gallery, positions are 0..1, facts are needed, spec keys must exist", () => {
    const p = base();
    const spot = (id: string, extra: object = {}) => ({ id, x: 0.5, y: 0.5, label: { en: id }, text: { en: "t" }, ...extra });
    p.media.gallery = [photo("a", { hotspots: [spot("s")] }), photo("b", { hotspots: [spot("s")] })];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.1\.hotspots\.0\.id: "s" is already used by media\.gallery\.0\.hotspots\.0/);
    p.media.gallery = [photo("a", { hotspots: [spot("s", { x: 1.2 })] })];
    expect(issues(p).join("\n")).toMatch(/hotspots\.0\.x/);
    p.media.gallery = [photo("a", { hotspots: [spot("s", { text: undefined })] })];
    expect(issues(p).join("\n")).toMatch(/needs specKeys or text/);
    p.media.gallery = [photo("a", { hotspots: [spot("s", { specKeys: ["nonsense"] })] })];
    expect(issues(p).join("\n")).toMatch(/hotspots\.0\.specKeys\.0: no spec with key "nonsense"/);
  });
  it("a photo id and a spot id may be the same word (their addresses differ)", () => {
    const p = base();
    p.media.gallery = [photo("seats", { hotspots: [{ id: "seats", x: 0.5, y: 0.5, label: { en: "s" }, text: { en: "t" } }] })];
    expect(issues(p)).toEqual([]);
  });
});
