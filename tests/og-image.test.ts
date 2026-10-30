/* eslint-disable @typescript-eslint/no-explicit-any -- the metadata object is read loosely */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "@/app/[lang]/layout";
import { OG_IMAGE_FILE, ogCropBox, ogImagePath } from "@/lib/og-image";
import { makeWebImages } from "../scripts/lib/web-images.mjs";
import { FIXTURE_DIR, fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "og-image");
const ref = fixtures.ref("fixture-car");
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

/** A copy of the fixture content whose gallery photo 1 is `photo` (an image file written by the test) with an optional focus. */
async function content(name: string, photo: Buffer, focus?: { x: number; y: number }) {
  const root = path.join(tmp, name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(FIXTURE_DIR, root, { recursive: true });
  const dir = path.join(root, ref);
  fs.writeFileSync(path.join(dir, "media", "photo-1.jpg"), photo);
  const file = path.join(dir, "product.json");
  const product = JSON.parse(fs.readFileSync(file, "utf8"));
  product.media.gallery[0] = { ...product.media.gallery[0], ...(focus ? { focus } : {}) };
  fs.writeFileSync(file, JSON.stringify(product));
  return root;
}
/** Top half red, bottom half blue. */
const twoColour = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#ff0000" } }).composite([{ input: { create: { width: w, height: h / 2, channels: 3, background: "#0000ff" } }, top: h / 2, left: 0 }]).jpeg({ quality: 95 }).toBuffer();
const mean = async (file: string) => {
  const { channels } = await sharp(file).stats();
  return channels.map((c) => c.mean); // r, g, b
};

describe("ogCropBox", () => {
  it("covers 1200x630 and takes the window around the focus (centre by default), never enlarging", () => {
    expect(ogCropBox(2000, 1500)).toEqual({ width: 1200, height: 900, left: 0, top: 135 });
    expect(ogCropBox(2000, 1500, { x: 0.5, y: 0 })).toMatchObject({ top: 0 });
    expect(ogCropBox(2000, 1500, { x: 0.5, y: 1 })).toMatchObject({ top: 270 });
    expect(ogCropBox(1200, 630)).toEqual({ width: 1200, height: 630, left: 0, top: 0 });
    expect(ogCropBox(3000, 2000)).toMatchObject({ width: 1200 + 0, left: 0 });
  });

  it("gives nothing for a photo smaller than 1200x630 in either direction", () => {
    expect(ogCropBox(1199, 800)).toBeNull();
    expect(ogCropBox(1600, 629)).toBeNull();
    expect(ogCropBox(800, 1200)).toBeNull();
  });
});

describe("the images step makes the Open Graph image", () => {
  it("from gallery photo 1: 1200x630, a JPEG, no EXIF, next to the product's photos", async () => {
    const out = path.join(tmp, "out-fixture");
    const results = await makeWebImages({ contentDir: FIXTURE_DIR, outDir: out });
    const file = path.join(out, ref, OG_IMAGE_FILE);
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, "jpeg"]);
    expect(meta.exif).toBeUndefined();
    expect(results.find((r) => r.file === OG_IMAGE_FILE)).toMatchObject({ action: "derived", width: 1200, height: 630 });
  });

  it("follows the photo's focus: a focus at the top shows the top, at the bottom the bottom", async () => {
    const photo = await twoColour(1600, 1600);
    const top = path.join(tmp, "out-top");
    const bottom = path.join(tmp, "out-bottom");
    await makeWebImages({ contentDir: await content("c-top", photo, { x: 0.5, y: 0 }), outDir: top });
    await makeWebImages({ contentDir: await content("c-bottom", photo, { x: 0.5, y: 1 }), outDir: bottom });
    const [r1, , b1] = await mean(path.join(top, ref, OG_IMAGE_FILE));
    const [r2, , b2] = await mean(path.join(bottom, ref, OG_IMAGE_FILE));
    expect(r1).toBeGreaterThan(200);
    expect(b1).toBeLessThan(60);
    expect(b2).toBeGreaterThan(200);
    expect(r2).toBeLessThan(60);
  });

  it("is not made from a photo smaller than 1200x630: a clear warning, no file, and a stale one is removed", async () => {
    const warn = vi.fn();
    const out = path.join(tmp, "out-small");
    const root = await content("c-small", await twoColour(1000, 600));
    await makeWebImages({ contentDir: root, outDir: out, warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/WARNING .*photo-1\.jpg\) is 1000x600, smaller than 1200x630: no Open Graph image \(it is never enlarged\)/);
    expect(fs.existsSync(path.join(out, ref, OG_IMAGE_FILE))).toBe(false);
    // a stale OG image goes when the photo can no longer give one
    const big = await content("c-stale", await twoColour(1600, 1600));
    const out2 = path.join(tmp, "out-stale");
    await makeWebImages({ contentDir: big, outDir: out2 });
    expect(fs.existsSync(path.join(out2, ref, OG_IMAGE_FILE))).toBe(true);
    fs.writeFileSync(path.join(big, ref, "media", "photo-1.jpg"), await twoColour(1000, 600));
    await makeWebImages({ contentDir: big, outDir: out2, warn });
    expect(fs.existsSync(path.join(out2, ref, OG_IMAGE_FILE))).toBe(false);
  });

  it("a second run leaves it alone (cached)", async () => {
    const out = path.join(tmp, "out-cached");
    await makeWebImages({ contentDir: FIXTURE_DIR, outDir: out });
    const again = await makeWebImages({ contentDir: FIXTURE_DIR, outDir: out });
    expect(again.find((r) => r.file === OG_IMAGE_FILE)?.action).toBe("cached");
  });
});

describe("the page uses it only when it exists", () => {
  beforeAll(() => {
    vi.stubEnv("CONTENT_DIR", FIXTURE_DIR);
    vi.stubEnv("CONTENT_PRODUCT", ref);
  });
  afterAll(() => vi.unstubAllEnvs());
  const meta = (lang: "de" | "en") => generateMetadata({ params: Promise.resolve({ lang }) }) as Promise<any>;
  /** A project root whose public/media holds (or lacks) the OG image. */
  const root = (withImage: boolean) => {
    const dir = path.join(tmp, withImage ? "root-with" : "root-without");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "public", "media", ref), { recursive: true });
    if (withImage) fs.writeFileSync(path.join(dir, "public", "media", ref, OG_IMAGE_FILE), "x");
    return dir;
  };

  it("finds the file by the product reference, or null", () => {
    expect(ogImagePath(ref, root(true))).toBe(`/media/${ref}/${OG_IMAGE_FILE}`);
    expect(ogImagePath(ref, root(false))).toBeNull();
  });

  it("og:image and twitter:image carry the file and the first photo's alt text in the page language, with summary_large_image", async () => {
    vi.stubEnv("SITE_URL", "https://www.example.com");
    vi.spyOn(process, "cwd").mockReturnValue(root(true));
    const de = await meta("de");
    expect(de.openGraph.images).toEqual([{ url: `/media/${ref}/${OG_IMAGE_FILE}`, width: 1200, height: 630, alt: "Testfoto eins" }]);
    expect(de.twitter).toMatchObject({ card: "summary_large_image", images: [{ url: `/media/${ref}/${OG_IMAGE_FILE}`, alt: "Testfoto eins" }] });
    expect((await meta("en")).openGraph.images[0].alt).toBe("Fixture photo one");
  });

  it("without the file: no og:image and a summary card; without SITE_URL: none either (a relative image is no use)", async () => {
    vi.stubEnv("SITE_URL", "https://www.example.com");
    vi.spyOn(process, "cwd").mockReturnValue(root(false));
    const none = await meta("en");
    expect(none.openGraph).not.toHaveProperty("images");
    expect(none.twitter.card).toBe("summary");
    vi.stubEnv("SITE_URL", "");
    vi.spyOn(process, "cwd").mockReturnValue(root(true));
    const noBase = await meta("en");
    expect(noBase.openGraph).not.toHaveProperty("images");
    expect(noBase.twitter.card).toBe("summary");
  });
});
