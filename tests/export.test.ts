import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ExportError, exportMediaWeb } from "../scripts/lib/export-media-web.mjs";
import { makeWebImages } from "../scripts/lib/web-images.mjs";
import { referencedFiles } from "../scripts/lib/referenced.mjs";
import { loadProduct } from "@/lib/content";
import { fixtures, sampleJson } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "export");
const SLUG = "fixture-car";
const REF = fixtures.ref(SLUG);
const src = path.join(fixtures.productDir(SLUG), "media");

/** A content folder with the fixture product (mutated), all fixture files as "originals" and one unused photo. */
function setup(name: string, mutate?: (p: Record<string, any>) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const contentDir = path.join(tmp, name);
  fs.rmSync(contentDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(contentDir, fixtures.seller, SLUG), { recursive: true });
  fs.copyFileSync(path.join(fixtures.root, fixtures.seller, "seller.json"), path.join(contentDir, fixtures.seller, "seller.json"));
  fs.cpSync(src, path.join(contentDir, fixtures.seller, SLUG, "media"), { recursive: true });
  const product = sampleJson(SLUG);
  mutate?.(product);
  fs.writeFileSync(path.join(contentDir, fixtures.seller, SLUG, "product.json"), JSON.stringify(product));
  return { contentDir, product, webDir: path.join(contentDir, fixtures.seller, SLUG, "media-web") };
}

beforeEach(() => fs.mkdirSync(tmp, { recursive: true }));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("referencedFiles", () => {
  it("lists hero, gallery, poster, background and a local video once each, with every place", () => {
    const refs = referencedFiles({
      media: { hero: "a.jpg", gallery: [{ file: "a.jpg" }, { file: "b.jpg" }], videoPoster: "p.jpg", background: "bg.jpg", video: "clip.mp4" },
    });
    expect(refs).toEqual([
      { file: "a.jpg", places: ["media.hero", "media.gallery.0.file"] },
      { file: "b.jpg", places: ["media.gallery.1.file"] },
      { file: "p.jpg", places: ["media.videoPoster"] },
      { file: "bg.jpg", places: ["media.background"] },
      { file: "clip.mp4", places: ["media.video"] },
    ]);
  });

  it("ignores a video URL and empty values", () => {
    expect(referencedFiles({ media: { hero: "a.jpg", gallery: [], video: "https://youtu.be/dQw4w9WgXcQ", background: null } }).map((r) => r.file)).toEqual(["a.jpg"]);
  });
});

describe("images:export", () => {
  it("exports exactly the referenced files, and lists the others as skipped (not used)", async () => {
    const { contentDir, product, webDir } = setup("exact", (p) => {
      p.media.video = "clip.mp4";
      p.media.videoPoster = "poster.jpg";
    });
    const lines: string[] = [];
    const report = await exportMediaWeb({ contentDir, log: (l: string) => lines.push(l) });
    const expected = [...new Set([product.media.hero, ...product.media.gallery.map((g: { file: string }) => g.file), "poster.jpg", "clip.mp4"])].sort();
    expect(fs.readdirSync(webDir).sort()).toEqual(expected);
    // the fixture folder has more photos than the product uses: they are skipped, never exported
    expect(report[0].skipped.sort()).toEqual(["big.jpg", "landscape-43.jpg", "panorama.jpg", "portrait.jpg"]);
    for (const f of report[0].skipped) {
      expect(fs.existsSync(path.join(webDir, f)), f).toBe(false);
      expect(lines).toContain(`${REF}/${f}: skipped (not used)`);
    }
  });

  it("processes the photos: 2000 px long side, rotation applied, EXIF and GPS stripped; video copied as it is", async () => {
    const { contentDir, webDir } = setup("processed", (p) => {
      p.media.gallery.push({ file: "big.jpg", alt: { en: "big" } });
      p.media.video = "clip.mp4";
    });
    await exportMediaWeb({ contentDir });
    const big = await sharp(path.join(webDir, "big.jpg")).metadata();
    expect([big.width, big.height]).toEqual([2000, 1333]);
    const sideways = await sharp(path.join(webDir, "sideways.jpg")).metadata();
    expect([sideways.width, sideways.height]).toEqual([1200, 1600]); // upright now
    expect(sideways.orientation ?? 1).toBe(1);
    for (const f of fs.readdirSync(webDir).filter((n) => n.endsWith(".jpg"))) {
      expect((await sharp(path.join(webDir, f)).metadata()).exif, f).toBeUndefined();
      expect(fs.readFileSync(path.join(webDir, f)).includes("GPS"), f).toBe(false);
    }
    expect(fs.readFileSync(path.join(webDir, "clip.mp4"))).toEqual(fs.readFileSync(path.join(src, "clip.mp4")));
    // the originals are untouched
    expect((await sharp(path.join(contentDir, fixtures.seller, SLUG, "media", "big.jpg")).metadata()).exif).toBeTruthy();
  });

  it("removes stale files and only rewrites what is used", async () => {
    const { contentDir, webDir } = setup("stale");
    fs.mkdirSync(webDir, { recursive: true });
    fs.writeFileSync(path.join(webDir, "old-photo.jpg"), "stale");
    fs.mkdirSync(path.join(webDir, "leftover-dir"));
    const lines: string[] = [];
    const report = await exportMediaWeb({ contentDir, log: (l: string) => lines.push(l) });
    expect(fs.existsSync(path.join(webDir, "old-photo.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(webDir, "leftover-dir"))).toBe(false);
    expect(report[0].removed.sort()).toEqual(["leftover-dir", "old-photo.jpg"]);
    expect(lines).toContain(`${REF}/old-photo.jpg: removed (stale)`);
  });

  it("fails with a clear message when a referenced file is missing, and writes nothing", async () => {
    const { contentDir, webDir } = setup("missing");
    fs.rmSync(path.join(contentDir, fixtures.seller, SLUG, "media", "hero.jpg"));
    fs.rmSync(path.join(contentDir, fixtures.seller, SLUG, "media", "photo-2.jpg"));
    await expect(exportMediaWeb({ contentDir })).rejects.toThrow(ExportError);
    await expect(exportMediaWeb({ contentDir })).rejects.toThrow(
      /Cannot export [\w-]+\/fixture-car: 2 file\(s\) used by product\.json are missing in [\w-]+\/fixture-car\/media\/:\n {2}- hero\.jpg \(media\.hero\)\n {2}- photo-2\.jpg \(media\.gallery\.1\.file\)/,
    );
    expect(fs.existsSync(webDir)).toBe(false);
  });

  it("says so when there is no media folder (a snapshot) and leaves media-web alone", async () => {
    const { contentDir, webDir } = setup("nomedia");
    await exportMediaWeb({ contentDir });
    fs.rmSync(path.join(contentDir, fixtures.seller, SLUG, "media"), { recursive: true });
    const lines: string[] = [];
    await exportMediaWeb({ contentDir, log: (l: string) => lines.push(l) });
    expect(lines[0]).toMatch(/no media folder here/);
    expect(fs.readdirSync(webDir).length).toBeGreaterThan(0);
  });
});

describe("media-web fallback", () => {
  it("the loader reads media-web when the originals folder is absent", async () => {
    const { contentDir } = setup("loader");
    await exportMediaWeb({ contentDir });
    fs.rmSync(path.join(contentDir, fixtures.seller, SLUG, "media"), { recursive: true });
    const { images, warnings } = loadProduct(REF, { contentDir });
    expect(images["hero.jpg"]).toEqual({ src: `/media/${REF}/hero.jpg`, width: 1200, height: 800 });
    expect(images["sideways.jpg"]).toMatchObject({ width: 1200, height: 1600 });
    expect(warnings).toEqual([]);
  });

  it("a referenced file missing from media-web is reported with media-web in the message", async () => {
    const { contentDir, webDir } = setup("loader-missing");
    await exportMediaWeb({ contentDir });
    fs.rmSync(path.join(contentDir, fixtures.seller, SLUG, "media"), { recursive: true });
    fs.rmSync(path.join(webDir, "photo-3.jpg"));
    expect(() => loadProduct(REF, { contentDir })).toThrow(/media\.gallery\.2\.file: file "photo-3\.jpg" not found in [\w-]+\/fixture-car\/media-web\//);
  });

  it("the originals win when both folders exist", async () => {
    const { contentDir, webDir } = setup("both");
    await exportMediaWeb({ contentDir });
    fs.rmSync(path.join(webDir, "hero.jpg")); // would be missing in media-web, but media is used
    expect(loadProduct(REF, { contentDir }).warnings).toEqual([]);
  });

  it("npm run images copies media-web as it is (no second lossy pass) when there are no originals", async () => {
    const { contentDir, webDir } = setup("images");
    await exportMediaWeb({ contentDir });
    fs.rmSync(path.join(contentDir, fixtures.seller, SLUG, "media"), { recursive: true });
    const outDir = path.join(tmp, "images-out");
    const results = await makeWebImages({ contentDir, outDir });
    // every media-web file is copied as it is; the only other result is the Open Graph image derived from gallery photo 1 (a new file, not a second pass over a copy)
    const others = results.filter((r: { action: string; file: string }) => r.action !== "copied");
    expect(others.map((r: { file: string }) => r.file)).toEqual(["og-1200x630.jpg"]);
    expect(others[0].action).toBe("derived");
    for (const f of fs.readdirSync(webDir)) expect(fs.readFileSync(path.join(outDir, REF, f))).toEqual(fs.readFileSync(path.join(webDir, f)));
  });
});
