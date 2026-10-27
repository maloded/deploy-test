import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { checkSnapshot, forbiddenReason } from "../scripts/lib/snapshot-guard.mjs";

const tmp = path.join(process.cwd(), ".test-tmp", "snapshot");
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("snapshot guard: paths", () => {
  it.each([
    ["node_modules/next/package.json", /node_modules/],
    ["a/node_modules/x.js", /node_modules/],
    [".git/config", /\.git/],
    ["data/leads/2026-10.jsonl", /data\/leads/],
    ["data/leads", /data\/leads/],
    ["content/x/data/leads/a.jsonl", /data\/leads/], // also inside a content folder
    [".private/forbidden-terms.txt", /\.private/],
    ["a/.private/x.txt", /\.private/],
    [".env", /\.env/],
    [".env.local", /\.env/],
    ["packages/web/.env.production", /\.env/],
    ["content/vw-multivan/media/Front.jpg", /original photo/],
    ["content/vw-multivan/media/Side.JPEG", /original photo/],
    ["content/x/media/IMG_1.heic", /original photo/],
  ])("refuses %s", (rel, why) => {
    expect(forbiddenReason(rel)).toMatch(why);
  });

  it("refuses a large file in the media folder, but not a small placeholder", () => {
    expect(forbiddenReason("content/x/media/hero.png", 2 * 1024 * 1024)).toMatch(/large file/);
    expect(forbiddenReason("examples/example-house/media/hero.png", 21 * 1024)).toBeNull();
  });

  it.each([
    "content/vw-multivan/media-web/Front-side.jpg",
    "content/vw-multivan/product.json",
    "tests/fixtures/content/fixture-car/media/hero.jpg", // generated test fixtures, not a content folder
    "src/lib/review.ts",
    "docs/private-notes.md", // "private" in a name is fine; only the .private folder is refused
    "public/fonts/light-editorial/inter.woff2",
    ".env.example", // variable names only, no values
    "environment.md", // starts with "env" but not ".env"
  ])("allows %s", (rel) => {
    expect(forbiddenReason(rel)).toBeNull();
  });
});

describe("snapshot guard: a tree", () => {
  const photoWithExif = (file: string) =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } })
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "0/1 1/1 0/1" } })
      .jpeg()
      .toFile(file);

  it("accepts a clean tree", async () => {
    const dir = path.join(tmp, "clean");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "content", "x", "media-web"), { recursive: true });
    await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toFile(path.join(dir, "content", "x", "media-web", "a.jpg"));
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    expect(await checkSnapshot(dir)).toEqual([]);
  });

  it("refuses a tree with leads, secrets, an original photo, node_modules and a photo that still has GPS", async () => {
    const dir = path.join(tmp, "dirty");
    fs.rmSync(dir, { recursive: true, force: true });
    for (const d of ["data/leads", "node_modules/x", "content/x/media", "content/x/media-web"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
    fs.writeFileSync(path.join(dir, "data/leads/a.jsonl"), "{}");
    fs.writeFileSync(path.join(dir, ".env.local"), "X=1");
    fs.writeFileSync(path.join(dir, "node_modules/x/i.js"), "");
    await photoWithExif(path.join(dir, "content/x/media/Front.jpg"));
    await photoWithExif(path.join(dir, "content/x/media-web/b.jpg"));
    const problems = await checkSnapshot(dir);
    expect(problems.join("\n")).toMatch(/data\/leads\/a\.jsonl: data\/leads/);
    expect(problems.join("\n")).toMatch(/\.env\.local: \.env file/);
    expect(problems.join("\n")).toMatch(/node_modules\/x\/i\.js: node_modules/);
    expect(problems.join("\n")).toMatch(/content\/x\/media\/Front\.jpg: an original photo/);
    expect(problems.join("\n")).toMatch(/content\/x\/media-web\/b\.jpg: still has EXIF/);
  });

  it("does not check the fixtures' fake GPS tag (it is there on purpose)", async () => {
    const dir = path.join(tmp, "fixtures");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "tests/fixtures/content/fixture-car/media"), { recursive: true });
    await photoWithExif(path.join(dir, "tests/fixtures/content/fixture-car/media/big.jpg"));
    expect(await checkSnapshot(dir)).toEqual([]);
  });
});
