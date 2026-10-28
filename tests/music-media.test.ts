import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { exportMediaWeb } from "../scripts/lib/export-media-web.mjs";
import { makeWebImages } from "../scripts/lib/web-images.mjs";
import { fixtures, sampleJson } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "music-media");
const SLUG = "fixture-car";
const src = path.join(fixtures.productDir(SLUG), "media");
// not music: a few arbitrary bytes are enough for a script that copies files as they are
const bytes = (seed: number) => Buffer.from(Array.from({ length: 700 }, (_, i) => (i * 31 + seed) & 255));
const track = (id: string) => ({ id, title: { en: id }, file: `audio/${id}.mp3`, license: "test" });

/** A content folder with the fixture product as it is, plus a music object and audio files in media/audio. */
function setup(name: string, used: string[], unused: string[] = []) {
  const contentDir = path.join(tmp, name);
  fs.rmSync(contentDir, { recursive: true, force: true });
  const productDir = path.join(contentDir, fixtures.seller, SLUG);
  fs.mkdirSync(productDir, { recursive: true });
  fs.copyFileSync(path.join(fixtures.root, fixtures.seller, "seller.json"), path.join(contentDir, fixtures.seller, "seller.json"));
  fs.cpSync(src, path.join(productDir, "media"), { recursive: true });
  const product = sampleJson(SLUG);
  product.music = { tracks: used.map(track) };
  fs.writeFileSync(path.join(productDir, "product.json"), JSON.stringify(product));
  fs.mkdirSync(path.join(productDir, "media", "audio"), { recursive: true });
  [...used, ...unused].forEach((id, i) => fs.writeFileSync(path.join(productDir, "media", "audio", `${id}.mp3`), bytes(i)));
  return { contentDir, productDir, webDir: path.join(productDir, "media-web"), product };
}
const run = (contentDir: string, lines: string[] = []) => exportMediaWeb({ contentDir, products: [fixtures.ref(SLUG)], log: (l: string) => lines.push(l) });

beforeEach(() => fs.mkdirSync(tmp, { recursive: true }));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("npm run images:export and audio", () => {
  it("copies a referenced track into media-web/audio byte for byte, without re-encoding", async () => {
    const s = setup("copy", ["calm"]);
    await run(s.contentDir);
    const out = path.join(s.webDir, "audio", "calm.mp3");
    expect(fs.readFileSync(out).equals(fs.readFileSync(path.join(s.productDir, "media", "audio", "calm.mp3")))).toBe(true);
  });

  it("a second run keeps audio/ as it is: same bytes, same modification time, nothing removed", async () => {
    const s = setup("again", ["calm", "soft"]);
    await run(s.contentDir);
    const files = ["audio/calm.mp3", "audio/soft.mp3"].map((f) => path.join(s.webDir, f));
    const first = files.map((f) => ({ data: fs.readFileSync(f), mtime: fs.statSync(f).mtimeMs }));
    const lines: string[] = [];
    const report = await run(s.contentDir, lines);
    expect(report[0].removed).toEqual([]);
    expect(lines.join("\n")).not.toContain("removed");
    files.forEach((f, i) => {
      expect(fs.readFileSync(f).equals(first[i].data)).toBe(true);
      expect(fs.statSync(f).mtimeMs).toBe(first[i].mtime);
    });
    const third = await run(s.contentDir);
    expect(third[0].removed).toEqual([]);
    expect(fs.readdirSync(path.join(s.webDir, "audio")).sort()).toEqual(["calm.mp3", "soft.mp3"]);
  });

  it("an unreferenced audio file is skipped like an unused photo and never exported", async () => {
    const s = setup("unused", ["calm"], ["spare"]);
    const lines: string[] = [];
    const report = await run(s.contentDir, lines);
    expect(lines).toContain(`${fixtures.seller}/${SLUG}/audio/spare.mp3: skipped (not used)`);
    expect(report[0].skipped).toContain("audio/spare.mp3");
    expect(fs.existsSync(path.join(s.webDir, "audio", "spare.mp3"))).toBe(false);
    expect(fs.existsSync(path.join(s.webDir, "audio", "calm.mp3"))).toBe(true);
  });

  it("a track dropped from product.json is removed from media-web, and an empty audio/ folder goes with it", async () => {
    const s = setup("stale", ["calm"]);
    await run(s.contentDir);
    const product = { ...s.product };
    delete product.music;
    fs.writeFileSync(path.join(s.productDir, "product.json"), JSON.stringify(product));
    const report = await run(s.contentDir);
    expect(report[0].removed).toEqual(["audio"]); // the stale folder goes as a whole
    expect(fs.existsSync(path.join(s.webDir, "audio"))).toBe(false);
  });

  it("fails naming the file when a referenced track is missing in media/", async () => {
    const s = setup("missing", ["calm"]);
    fs.rmSync(path.join(s.productDir, "media", "audio", "calm.mp3"));
    await expect(run(s.contentDir)).rejects.toThrow(/audio\/calm\.mp3 \(music\.tracks\.0\.file\)/);
  });
});

describe("npm run images and audio", () => {
  it("copies a referenced track from media/ as it is, and not an unreferenced one", async () => {
    const s = setup("web", ["calm"], ["spare"]);
    const outDir = path.join(tmp, "web-out");
    fs.rmSync(outDir, { recursive: true, force: true });
    await makeWebImages({ contentDir: s.contentDir, outDir });
    const base = path.join(outDir, fixtures.seller, SLUG, "audio");
    expect(fs.readFileSync(path.join(base, "calm.mp3")).equals(fs.readFileSync(path.join(s.productDir, "media", "audio", "calm.mp3")))).toBe(true);
    expect(fs.existsSync(path.join(base, "spare.mp3"))).toBe(false);
    // a second run changes nothing
    const before = fs.statSync(path.join(base, "calm.mp3")).mtimeMs;
    await makeWebImages({ contentDir: s.contentDir, outDir });
    expect(fs.statSync(path.join(base, "calm.mp3")).mtimeMs).toBe(before);
  });

  it("uses the exported media-web/audio when the originals are not here", async () => {
    const s = setup("web-only", ["calm"]);
    await run(s.contentDir);
    fs.rmSync(path.join(s.productDir, "media"), { recursive: true });
    const outDir = path.join(tmp, "web-out-2");
    fs.rmSync(outDir, { recursive: true, force: true });
    await makeWebImages({ contentDir: s.contentDir, outDir });
    expect(fs.existsSync(path.join(outDir, fixtures.seller, SLUG, "audio", "calm.mp3"))).toBe(true);
  });
});
