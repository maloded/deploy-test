/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ContentError, loadProduct } from "@/lib/content";
import { objectPosition } from "@/lib/focus";
import { formatPrice, pick } from "@/lib/i18n";
import { parseImageSize } from "@/lib/image-size";
import { validateProduct } from "@/lib/validate";
import { examples, fixtures, loadFor, sampleJson } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "loader");
const SLUG = "fixture-car";
const REF = fixtures.ref(SLUG);

/** A copy of the fixture product under .test-tmp, with the media files the (mutated) product references. */
function copyFixture(name: string, mutate?: (p: Record<string, any>) => void) {
  const contentDir = path.join(tmp, name);
  fs.rmSync(contentDir, { recursive: true, force: true });
  const media = path.join(contentDir, fixtures.seller, SLUG, "media");
  fs.mkdirSync(media, { recursive: true });
  fs.copyFileSync(path.join(fixtures.root, fixtures.seller, "seller.json"), path.join(contentDir, fixtures.seller, "seller.json"));
  const p = sampleJson(SLUG);
  mutate?.(p);
  fs.writeFileSync(path.join(contentDir, fixtures.seller, SLUG, "product.json"), JSON.stringify(p));
  const files: string[] = [p.media.hero, ...p.media.gallery.map((g: any) => g.file)];
  for (const f of [p.media.background, p.media.videoPoster]) if (f) files.push(f);
  for (const f of new Set(files)) fs.copyFileSync(path.join(fixtures.productDir(SLUG), "media", f), path.join(media, f));
  return contentDir;
}

beforeEach(() => fs.mkdirSync(tmp, { recursive: true }));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("loadProduct", () => {
  it("loads the fixture product and reads the photo sizes, rotation applied", () => {
    const { product, images, warnings } = loadFor(SLUG);
    expect(product.slug).toBe(SLUG);
    expect(images["hero.jpg"]).toEqual({ src: `/media/${REF}/hero.jpg`, width: 1200, height: 800 });
    // stored 1600x1200 with EXIF orientation 6: shown as a portrait photo
    expect(images["sideways.jpg"]).toMatchObject({ width: 1200, height: 1600 });
    expect(warnings).toEqual([]);
  });

  it("fails with a readable list when a referenced file is missing", () => {
    const dir = copyFixture("missing-file");
    fs.rmSync(path.join(dir, fixtures.seller, SLUG, "media", "hero.jpg"));
    fs.rmSync(path.join(dir, fixtures.seller, SLUG, "media", "photo-2.jpg"));
    try {
      loadProduct(REF, { contentDir: dir });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      const issues = (e as ContentError).issues;
      expect(issues).toContain(`media.hero: file "hero.jpg" not found in ${REF}/media/`);
      expect(issues.some((i) => i.startsWith("media.gallery.1.file:"))).toBe(true);
    }
  });

  it("turns a missing file into a warning when strictMedia is false", () => {
    const dir = copyFixture("lenient");
    fs.rmSync(path.join(dir, fixtures.seller, SLUG, "media", "hero.jpg"));
    const { images, warnings } = loadProduct(REF, { contentDir: dir, strictMedia: false });
    expect(images["hero.jpg"]).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it("reports schema errors with their paths", () => {
    const dir = copyFixture("bad-schema", (p) => {
      delete p.title;
      p.blocks = ["nope"];
    });
    expect(() => loadProduct(REF, { contentDir: dir })).toThrow(/title[\s\S]*blocks\.0/);
  });

  it("rejects a slug that differs from the folder name", () => {
    const dir = copyFixture("slug", (p) => (p.slug = "other"));
    expect(() => loadProduct(REF, { contentDir: dir })).toThrow(/slug: is "other"/);
  });

  it("rejects invalid JSON and a missing product", () => {
    const dir = copyFixture("bad-json");
    fs.writeFileSync(path.join(dir, fixtures.seller, SLUG, "product.json"), "{ not json");
    expect(() => loadProduct(REF, { contentDir: dir })).toThrow(/not valid JSON/);
    expect(() => loadProduct(fixtures.ref("nope"), { contentDir: dir })).toThrow(/file not found/);
  });

  it("accepts a video URL without a file", () => {
    const dir = copyFixture("video-url", (p) => (p.media.video = "https://youtu.be/dQw4w9WgXcQ"));
    expect(loadProduct(REF, { contentDir: dir }).warnings).toEqual([]);
  });

  it("checks that a local video file and the poster exist", () => {
    const dir = copyFixture("video-file", (p) => {
      p.media.video = "clip.mp4";
      p.media.videoPoster = "poster.jpg";
    });
    // clip.mp4 was not copied (only photos are), so it is missing
    expect(() => loadProduct(REF, { contentDir: dir })).toThrow(/media\.video: file "clip\.mp4" not found/);
    fs.copyFileSync(path.join(fixtures.productDir(SLUG), "media", "clip.mp4"), path.join(dir, fixtures.seller, SLUG, "media", "clip.mp4"));
    expect(loadProduct(REF, { contentDir: dir }).warnings).toEqual([]);
    fs.rmSync(path.join(dir, fixtures.seller, SLUG, "media", "poster.jpg"));
    expect(() => loadProduct(REF, { contentDir: dir })).toThrow(/media\.videoPoster: file "poster\.jpg" not found/);
  });
});

describe("language fallback", () => {
  const { product } = loadFor(SLUG);

  it("returns the requested language when present", () => {
    expect(pick(product.title, "de")).toMatch(/Testdaten/);
  });

  it("falls back to English when the language is missing", () => {
    expect(pick({ en: "only English" }, "de")).toBe("only English");
  });

  it("passes plain strings through", () => {
    expect(pick("2023", "de")).toBe("2023");
  });

  it("formats the price for the language", () => {
    expect(formatPrice(589, "EUR", "month", "en")).toBe("€589 / month");
    expect(formatPrice(589, "EUR", "month", "de")).toMatch(/589\s€ \/ Monat/);
    expect(formatPrice(1000, "EUR", undefined, "en")).toBe("€1,000");
  });
});

/** A JPEG with an EXIF orientation tag and a SOF0 header of the given stored size. */
function jpegWithOrientation(orientation: number, width: number, height: number, bigEndian = false) {
  const w16 = (n: number) => Buffer.from(bigEndian ? [n >> 8, n & 255] : [n & 255, n >> 8]);
  const w32 = (n: number) => Buffer.from(bigEndian ? [0, 0, n >> 8, n & 255] : [n & 255, n >> 8, 0, 0]);
  const tiff = Buffer.concat([
    Buffer.from(bigEndian ? "MM" : "II", "ascii"),
    w16(42),
    w32(8), // IFD0 offset
    w16(1), // one entry
    w16(0x0112), w16(3), w32(1), w16(orientation), w16(0), // orientation (SHORT)
    w32(0), // no next IFD
  ]);
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof]);
}

describe("parseImageSize", () => {
  it("reads PNG, SVG and JPEG headers", () => {
    const png = Buffer.alloc(33);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(parseImageSize(png)).toEqual({ width: 640, height: 480 });

    expect(parseImageSize(Buffer.from('<svg xmlns="x" width="300px" height="200"></svg>'))).toEqual({ width: 300, height: 200 });
    expect(parseImageSize(Buffer.from('<svg viewBox="0 0 120 80"></svg>'))).toEqual({ width: 120, height: 80 });

    // SOI, APP0 (len 4), SOF0 with 50x70
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x46, 0x00, 0x32, 0x01, 0x01, 0x11, 0x00]);
    expect(parseImageSize(jpeg)).toEqual({ width: 50, height: 70 });
  });

  it("swaps width and height for JPEGs stored sideways (EXIF orientation 5-8)", () => {
    expect(parseImageSize(jpegWithOrientation(1, 4000, 3000))).toEqual({ width: 4000, height: 3000 });
    expect(parseImageSize(jpegWithOrientation(3, 4000, 3000))).toEqual({ width: 4000, height: 3000 });
    expect(parseImageSize(jpegWithOrientation(6, 4000, 3000))).toEqual({ width: 3000, height: 4000 });
    expect(parseImageSize(jpegWithOrientation(8, 4000, 3000))).toEqual({ width: 3000, height: 4000 });
    expect(parseImageSize(jpegWithOrientation(6, 4000, 3000, true))).toEqual({ width: 3000, height: 4000 });
  });

  it("throws on unknown data", () => {
    expect(() => parseImageSize(Buffer.from("hello"), "x.bin")).toThrow(/Cannot read the size of x.bin/);
  });

  it("matches the generated PNG placeholders", () => {
    const hero = fs.readFileSync(path.join(examples.productDir("example-house"), "media", "hero.png"));
    expect(zlib.crc32(hero.subarray(12, 29))).toBe(hero.readUInt32BE(29));
    expect(parseImageSize(hero)).toEqual({ width: 640, height: 360 });
  });
});

describe("photo focus point", () => {
  const issues = (p: unknown) => {
    const r = validateProduct(p);
    return r.ok ? [] : r.issues;
  };

  it("is optional and accepted on the hero and on gallery photos", () => {
    const p = sampleJson(SLUG);
    expect(p.media.heroFocus).toEqual({ x: 0.5, y: 0.5 });
    expect(p.media.gallery[1].focus).toEqual({ x: 0.25, y: 0.75 });
    expect(issues(p)).toEqual([]);
    delete p.media.heroFocus;
    p.media.gallery.forEach((g: any) => delete g.focus);
    expect(issues(p)).toEqual([]);
  });

  it("must be fractions between 0 and 1", () => {
    const p = sampleJson(SLUG);
    p.media.gallery[0].focus = { x: 1.2, y: -0.1 };
    p.media.heroFocus = { x: 0.5 };
    const out = issues(p).join("\n");
    expect(out).toMatch(/media\.gallery\.0\.focus\.x/);
    expect(out).toMatch(/media\.gallery\.0\.focus\.y/);
    expect(out).toMatch(/media\.heroFocus\.y/);
  });

  it("becomes the CSS object-position", () => {
    expect(objectPosition({ x: 0.5, y: 0.35 })).toBe("50% 35%");
    expect(objectPosition({ x: 0, y: 1 })).toBe("0% 100%");
    expect(objectPosition({ x: 0.333, y: 0.6667 })).toBe("33.3% 66.7%");
    expect(objectPosition(undefined)).toBeUndefined();
  });
});
