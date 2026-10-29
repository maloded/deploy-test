import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { AvatarError, makeWebAvatars, reportAvatars, selectedAvatarIds } from "../scripts/lib/avatars.mjs";
import { contentScanFiles } from "../scripts/lib/content-scan.mjs";
import { createSnapshot } from "../scripts/lib/snapshot.mjs";
import { forbiddenReason, walk } from "../scripts/lib/snapshot-guard.mjs";
import { referencedFiles } from "../scripts/lib/referenced.mjs";
import { MAX_AVATAR_POSTER_BYTES, MAX_AVATAR_VIDEO_BYTES } from "@/lib/avatar-manifest";

const tmp = path.join(process.cwd(), ".test-tmp", "avatar-media");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...a], { cwd, encoding: "utf8" }).trim();
const put = (root: string, rel: string, data: string | Buffer = "x") => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};
const poster = (exif = false) => {
  const img = sharp({ create: { width: 16, height: 20, channels: 3, background: "#789" } });
  return (exif ? img.withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "0/1 1/1 0/1" } }) : img).webp().toBuffer();
};
const pack = async (root: string, id: string, extra: object = {}, files: string[] = [], exif = false) => {
  put(root, `_avatars/${id}/avatar.json`, JSON.stringify({ schema: 1, id, name: id, poster: "poster.webp", license: "Synthetic", provenance: "Generated for the tests", ...extra }));
  put(root, `_avatars/${id}/poster.webp`, await poster(exif));
  for (const f of files) put(root, `_avatars/${id}/${f}`, "video bytes");
};
const seller = (root: string, slug: string, avatar?: string) => put(root, `${slug}/seller.json`, JSON.stringify({ displayName: slug, ...(avatar ? { agent: { id: "x", avatar: { id: avatar } } } : {}) }));

describe("only the selected pack is carried", () => {
  it("lists the ids the sellers select, once each", async () => {
    const root = path.join(tmp, "select");
    seller(root, "sell-a", "pack-a");
    seller(root, "sell-b", "pack-a");
    seller(root, "sell-c");
    put(root, "sell-a/p/product.json", "{}");
    put(root, "sell-c/p/product.json", "{}");
    expect(selectedAvatarIds(root)).toEqual(["pack-a"]);
  });

  it("npm run images copies the selected pack to public/avatars and nothing of the rest of the library", async () => {
    const root = path.join(tmp, "web");
    const out = path.join(tmp, "web-out", "avatars");
    seller(root, "sell-a", "pack-a");
    put(root, "sell-a/p/product.json", "{}");
    await pack(root, "pack-a", { idle: "i.mp4", listen: "l.mp4" }, ["i.mp4", "l.mp4", "unused.mp4"]);
    await pack(root, "pack-b", { idle: "i.mp4" }, ["i.mp4"]);
    makeWebAvatars({ contentDir: root, outDir: out });
    expect(walk(out, out).map((f) => f.rel)).toEqual(["pack-a/i.mp4", "pack-a/l.mp4", "pack-a/poster.webp"]); // no avatar.json, no unused file, no pack-b
    // a stale output goes on the next run: the seller selected nothing any more
    seller(root, "sell-a");
    makeWebAvatars({ contentDir: root, outDir: out });
    expect(fs.existsSync(out)).toBe(false);
  });

  it("an unknown or broken selected pack stops the copy with the id and the library path", async () => {
    const root = path.join(tmp, "web-bad");
    seller(root, "sell-a", "nobody");
    put(root, "sell-a/p/product.json", "{}");
    expect(() => makeWebAvatars({ contentDir: root, outDir: path.join(tmp, "web-bad-out") })).toThrow(AvatarError);
    expect(() => makeWebAvatars({ contentDir: root, outDir: path.join(tmp, "web-bad-out") })).toThrow(`avatar "nobody" is not in the avatar library ${path.join(root, "_avatars")}`);
  });

  it("images:export reports the used packs with their files and skips the others; a poster with metadata is refused", async () => {
    const root = path.join(tmp, "export");
    seller(root, "sell-a", "pack-a");
    put(root, "sell-a/p/product.json", "{}");
    await pack(root, "pack-a", { speak: "s.webm" }, ["s.webm"]);
    await pack(root, "pack-b");
    const r = await reportAvatars(root);
    expect(r.used.map((u) => [u.id, u.files.map((f) => f.file)])).toEqual([["pack-a", ["poster.webp", "s.webm"]]]);
    expect(r.skipped).toEqual(["pack-b"]);
    await pack(root, "pack-a", {}, [], true);
    await expect(reportAvatars(root)).rejects.toThrow(/EXIF/);
  });

  it("referencedFiles() is about a product's own media and does not include the library (the pack is linked from the seller)", () => {
    expect(referencedFiles({ media: { hero: "a.jpg", gallery: [] } }).map((r) => r.file)).toEqual(["a.jpg"]);
  });
});

describe("the snapshot", () => {
  const setup = async () => {
    const base = path.join(tmp, `snap-${Math.random().toString(36).slice(2)}`);
    const project = path.join(base, "project");
    const contentRoot = path.join(base, "content-root");
    put(project, "package.json", "{}");
    put(project, ".gitignore", "content/**/media/\ncontent/**/media-web/\n");
    for (const note of ["PROJECT.md", "PROGRESS.md", "README.md", "DEPLOY.md", "docs/a.md"]) put(project, note, "notes\n");
    put(project, "src/a.ts", "export {};\n");
    put(project, "examples/ex-seller/ex/product.json", "{}");
    put(project, "tests/fixtures/content/f-seller/f/product.json", "{}");
    git(project, "init", "-q", "-b", "main");
    git(project, "add", "-A");
    git(project, "commit", "-q", "-m", "template");
    seller(contentRoot, "sell-a", "pack-a");
    seller(contentRoot, "sell-b", "pack-b");
    for (const ref of ["sell-a/alpha", "sell-b/beta"]) {
      put(contentRoot, `${ref}/product.json`, JSON.stringify({ media: { hero: "a.jpg", gallery: [] } }));
      put(contentRoot, `${ref}/media/a.jpg`, await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } }).jpeg().toBuffer());
    }
    await pack(contentRoot, "pack-a", { idle: "i.mp4" }, ["i.mp4", "unused.mp4"]);
    await pack(contentRoot, "pack-b", {}, []);
    await pack(contentRoot, "pack-c", {}, []);
    return { project, contentRoot, dest: path.join(base, "snapshot") };
  };

  it("holds the seller's selected pack (poster, loops, avatar.json) and no other pack or unused file", async () => {
    const s = await setup();
    await createSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: "sell-a/alpha", dest: s.dest });
    const avatars = walk(s.dest, s.dest).map((f) => f.rel).filter((r) => r.includes("_avatars"));
    expect(avatars).toEqual(["content/_avatars/pack-a/avatar.json", "content/_avatars/pack-a/i.mp4", "content/_avatars/pack-a/poster.webp"]);
  });

  it("a snapshot of a seller without an avatar holds no library at all", async () => {
    const s = await setup();
    seller(s.contentRoot, "sell-a");
    await createSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: "sell-a/alpha", dest: s.dest });
    expect(fs.existsSync(path.join(s.dest, "content", "_avatars"))).toBe(false);
  });

  it("refuses to build when the selected pack is unknown", async () => {
    const s = await setup();
    seller(s.contentRoot, "sell-a", "nobody");
    await expect(createSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: "sell-a/alpha", dest: s.dest })).rejects.toThrow(/avatar "nobody" is not in the avatar library/);
  });
});

describe("snapshot guard: the avatar library", () => {
  it("allows the files of a pack within the limits", () => {
    for (const rel of ["content/_avatars/a/avatar.json", "content/_avatars/a/poster.webp", "content/_avatars/a/i.mp4", "content/_avatars/a/i.webm"]) expect(forbiddenReason(rel, 1000), rel).toBeNull();
    expect(forbiddenReason("content/_avatars/a/i.mp4", MAX_AVATAR_VIDEO_BYTES)).toBeNull();
    expect(forbiddenReason("content/_avatars/a/poster.webp", MAX_AVATAR_POSTER_BYTES)).toBeNull();
  });

  it("refuses anything else: other types, a deeper folder, an oversized video or poster", () => {
    expect(forbiddenReason("content/_avatars/a/photo.jpg", 10)).toMatch(/not part of an avatar pack/);
    expect(forbiddenReason("content/_avatars/a/original/x.mp4", 10)).toMatch(/no deeper folder/);
    expect(forbiddenReason("content/_avatars/a/i.mp4", MAX_AVATAR_VIDEO_BYTES + 1)).toMatch(/video limit/);
    expect(forbiddenReason("content/_avatars/a/poster.webp", MAX_AVATAR_POSTER_BYTES + 1)).toMatch(/poster limit/);
  });
});

describe("the content scan", () => {
  it("reads the avatar library's text (license, provenance) like a seller's files", () => {
    const project = path.join(tmp, "scan-project");
    const root = path.join(tmp, "scan-content");
    put(project, "README.md", "x");
    put(root, "sell-a/seller.json", "{}");
    put(root, "sell-a/p/product.json", "{}");
    put(root, "_avatars/pack-a/avatar.json", "{}");
    const files = contentScanFiles({ projectRoot: project, contentRoot: root });
    expect(files).toContain(path.join(root, "_avatars", "pack-a", "avatar.json"));
  });
});
