/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadProduct } from "@/lib/content";
import { MAX_AUDIO_BYTES, startTrackId } from "@/lib/music";
import { referencedFiles } from "../scripts/lib/referenced.mjs";
import { fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "music-data");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const track = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: { en: `Track ${id}`, de: `Titel ${id}` }, file: `audio/${id}.wav`, license: "test fixture, generated", ...extra });
let n = 0;
/** A copy of the fixture seller and product with the given music object and audio files (name -> bytes). */
function setup(music: unknown, files: Record<string, number | Buffer> = {}) {
  const root = path.join(tmp, `case-${++n}`);
  fs.cpSync(path.join(fixtures.root, fixtures.seller), path.join(root, fixtures.seller), { recursive: true });
  const dir = path.join(root, fixtures.seller, "fixture-car");
  const product = JSON.parse(fs.readFileSync(path.join(dir, "product.json"), "utf8"));
  if (music !== undefined) product.music = music;
  fs.writeFileSync(path.join(dir, "product.json"), JSON.stringify(product, null, 2));
  fs.mkdirSync(path.join(dir, "media", "audio"), { recursive: true });
  for (const [name, size] of Object.entries(files)) {
    const file = path.join(dir, "media", name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (Buffer.isBuffer(size)) fs.writeFileSync(file, size);
    else {
      fs.writeFileSync(file, "");
      fs.truncateSync(file, size);
    }
  }
  return { root, dir, load: (strictMedia = true) => loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: root, strictMedia }) };
}
const A = { "audio/a.wav": 100, "audio/b.wav": 100 };

describe("music in product.json", () => {
  it("no music object: nothing in the loaded product", () => {
    expect(setup(undefined).load().product.music).toBeUndefined();
    expect(fixtures.loadFor("fixture-car").product.music).toBeUndefined();
  });

  it("a valid object gets its defaults: volume 0.15, autostart button, the first track starts", () => {
    const { product } = setup({ tracks: [track("a"), track("b")] }, A).load();
    expect(product.music).toMatchObject({ volume: 0.15, autostart: "button" });
    expect(product.music!.defaultTrack).toBeUndefined();
    expect(startTrackId(product.music as any)).toBe("a");
    const set = setup({ tracks: [track("a"), track("b")], defaultTrack: "b", volume: 0.4, autostart: "gesture" }, A).load().product.music!;
    expect(set).toMatchObject({ defaultTrack: "b", volume: 0.4, autostart: "gesture" });
    expect(startTrackId(set as any)).toBe("b");
    expect(set.tracks[0].license).toBe("test fixture, generated"); // kept as data, never shown
  });

  it.each([
    ["an unknown defaultTrack", { tracks: [track("a")], defaultTrack: "zzz" }, /music\.defaultTrack: "zzz" is not a track id \(a\)/],
    ["more than 6 tracks", { tracks: "seven" }, /music\.tracks: .*(at most 6|<=6)/i],
    ["no track", { tracks: [] }, /music\.tracks/],
    ["a bad extension", { tracks: [track("a", { file: "audio/a.flac" })] }, /music\.tracks\.0\.file: must be audio\/<name>\.mp3, \.m4a, \.ogg or \.wav/],
    ["a file outside audio/", { tracks: [track("a", { file: "a.wav" })] }, /music\.tracks\.0\.file/],
    ["a folder in the name", { tracks: [track("a", { file: "audio/x/a.wav" })] }, /music\.tracks\.0\.file/],
    ["a title over 24 characters", { tracks: [track("a", { title: { en: "x".repeat(25) } })] }, /music\.tracks\.0\.title: at most 24 characters per language/],
    ["an unknown autostart", { tracks: [track("a")], autostart: "always" }, /music\.autostart: .*"button".*"gesture"/],
    ["a duplicate id", { tracks: [track("a"), track("a", { file: "audio/b.wav" })] }, /music\.tracks\.1\.id: "a" is used twice/],
    ["a volume above 1", { tracks: [track("a")], volume: 2 }, /music\.volume/],
    ["an unknown key", { tracks: [track("a")], loopForever: true }, /music/],
    ["a missing license note", { tracks: [{ id: "a", title: { en: "A" }, file: "audio/a.wav" }] }, /music\.tracks\.0\.license/],
  ])("refuses %s", (_label, music, message) => {
    if ((music as any).tracks === "seven") (music as any).tracks = ["a", "b", "c", "d", "e", "f", "g"].map((id) => track(id));
    expect(() => setup(music, A).load()).toThrow(message);
  });

  it("a missing file fails a production build naming the path, and only warns in development", () => {
    const s = setup({ tracks: [track("a"), track("missing")] }, { "audio/a.wav": 100 });
    expect(() => s.load(true)).toThrow(/music\.tracks\.1\.file: file "audio\/missing\.wav" not found in .*\/media\//);
    expect(s.load(false).warnings.join("\n")).toMatch(/music\.tracks\.1\.file: file "audio\/missing\.wav" not found/);
  });

  it("a file over 5 MB is an error with its size, one at exactly 5 MB passes", () => {
    const big = setup({ tracks: [track("a")] }, { "audio/a.wav": MAX_AUDIO_BYTES + 1 });
    expect(() => big.load(false)).toThrow(/music\.tracks\.0\.file: file "audio\/a\.wav" is 5\.0 MB, more than the 5 MB limit/);
    expect(setup({ tracks: [track("a")] }, { "audio/a.wav": MAX_AUDIO_BYTES }).load().product.music).toBeDefined();
  });

  it("the media scripts see the track files as used (audio/<name>)", () => {
    const refs = referencedFiles({ media: { hero: "h.jpg", gallery: [] }, music: { tracks: [track("a"), track("b")] } }).map((r: { file: string }) => r.file);
    expect(refs).toEqual(expect.arrayContaining(["audio/a.wav", "audio/b.wav"]));
    expect(referencedFiles({ media: { hero: "h.jpg", gallery: [] } }).map((r: { file: string }) => r.file)).toEqual(["h.jpg"]);
  });
});
