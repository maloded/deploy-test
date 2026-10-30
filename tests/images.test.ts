import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeWebImages } from "../scripts/lib/web-images.mjs";
import { FIXTURE_DIR, fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "images");
const src = path.join(fixtures.productDir("fixture-car"), "media");
const out = path.join(tmp, "out", fixtures.ref("fixture-car"));

const hashDir = (dir: string) =>
  Object.fromEntries(fs.readdirSync(dir).map((f) => [f, crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex")]));

describe("make-web-images", () => {
  let before: Record<string, string>;
  let first: Awaited<ReturnType<typeof makeWebImages>>;

  beforeAll(async () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    before = hashDir(src);
    first = await makeWebImages({ contentDir: FIXTURE_DIR, outDir: path.join(tmp, "out") });
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("the fixtures really have EXIF and GPS to strip", async () => {
    for (const f of ["big.jpg", "sideways.jpg"]) {
      const meta = await sharp(path.join(src, f)).metadata();
      expect(meta.exif, f).toBeTruthy();
    }
    expect((await sharp(path.join(src, "sideways.jpg")).metadata()).orientation).toBe(6);
  });

  it("limits the long side to 2000 px and never enlarges", async () => {
    const big = await sharp(path.join(out, "big.jpg")).metadata();
    expect([big.width, big.height]).toEqual([2000, 1333]);
    const hero = await sharp(path.join(out, "hero.jpg")).metadata();
    expect([hero.width, hero.height]).toEqual([1200, 800]); // already small: kept
  });

  it("applies the rotation: the sideways photo comes out upright", async () => {
    const meta = await sharp(path.join(out, "sideways.jpg")).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 1600]);
    expect(meta.orientation ?? 1).toBe(1);
  });

  it("strips EXIF and GPS from every image", async () => {
    for (const f of fs.readdirSync(out).filter((n) => n.endsWith(".jpg"))) {
      const file = path.join(out, f);
      const meta = await sharp(file).metadata();
      expect(meta.exif, f).toBeUndefined();
      const bytes = fs.readFileSync(file);
      expect(bytes.includes("Exif"), f).toBe(false);
      expect(bytes.includes("GPS"), f).toBe(false);
    }
  });

  it("keeps file names and copies non-image files as they are", () => {
    // the same names, plus the Open Graph image the step derives from gallery photo 1 (og-1200x630.jpg)
    expect(fs.readdirSync(out).sort()).toEqual([...fs.readdirSync(src), "og-1200x630.jpg"].sort());
    expect(fs.readFileSync(path.join(out, "clip.mp4"))).toEqual(fs.readFileSync(path.join(src, "clip.mp4")));
    expect(first.find((r) => r.file === "clip.mp4")?.action).toBe("copied");
  });

  it("never touches the originals", () => {
    expect(hashDir(src)).toEqual(before);
  });

  it("skips files that are already up to date, and redoes a changed source", async () => {
    const again = await makeWebImages({ contentDir: FIXTURE_DIR, outDir: path.join(tmp, "out") });
    expect(again.every((r) => r.action === "cached")).toBe(true);

    // a copy of the content with a touched source: only that file is redone
    const content = path.join(tmp, "content");
    fs.cpSync(FIXTURE_DIR, content, { recursive: true });
    const outDir = path.join(tmp, "out2");
    await makeWebImages({ contentDir: content, outDir });
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(content, fixtures.ref("fixture-car"), "media", "photo-1.jpg"), later, later);
    const third = await makeWebImages({ contentDir: content, outDir });
    // photo-1.jpg is gallery photo 1, so the Open Graph image cut from it is redone with it
    expect(third.filter((r) => r.action !== "cached").map((r) => r.file)).toEqual(["photo-1.jpg", "og-1200x630.jpg"]);
  });

  it("removes outputs whose source is gone", async () => {
    const content = path.join(tmp, "content-gone");
    fs.cpSync(FIXTURE_DIR, content, { recursive: true });
    const outDir = path.join(tmp, "out3");
    await makeWebImages({ contentDir: content, outDir });
    fs.rmSync(path.join(content, fixtures.ref("fixture-car"), "media", "photo-4.jpg"));
    await makeWebImages({ contentDir: content, outDir });
    expect(fs.existsSync(path.join(outDir, fixtures.ref("fixture-car"), "photo-4.jpg"))).toBe(false);
  });
});
