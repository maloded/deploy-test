import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { avatarFiles, avatarLoops, avatarManifestSchema, loopFiles, MAX_AVATAR_POSTER_BYTES, MAX_AVATAR_VIDEO_BYTES } from "@/lib/avatar-manifest";
import { listAvatars, readAvatar, scanAvatars } from "@/lib/avatar-library";
import { examples } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "avatar-library");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const base = { schema: 1, id: "pack-a", name: "Pack A", poster: "poster.webp", license: "Synthetic", provenance: "Generated for the tests" };
const write = (root: string, id: string, manifest: object | string, files: Record<string, number> = { "poster.webp": 10 }) => {
  const dir = path.join(root, "_avatars", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "avatar.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes));
};

describe("avatar manifest", () => {
  it("accepts a poster-only pack and every combination of loops", () => {
    expect(avatarManifestSchema.safeParse(base).success).toBe(true);
    const full = { ...base, voiceHint: "female", idle: "i.mp4", listen: { mp4: "l.mp4", webm: "l.webm" }, speak: "s.webm" };
    expect(avatarManifestSchema.safeParse(full).success).toBe(true);
  });

  it("is strict: an unknown key, a wrong schema number or a missing required field is refused", () => {
    expect(avatarManifestSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(avatarManifestSchema.safeParse({ ...base, schema: 2 }).success).toBe(false);
    for (const key of ["id", "name", "poster", "license", "provenance"]) {
      const rest: Record<string, unknown> = { ...base };
      delete rest[key];
      expect(avatarManifestSchema.safeParse(rest).success, key).toBe(false);
    }
    expect(avatarManifestSchema.safeParse({ ...base, voiceHint: "robot" }).success).toBe(false);
    expect(avatarManifestSchema.safeParse({ ...base, listen: { mp4: "l.mp4", ogv: "l.ogv" } }).success).toBe(false);
  });

  it("allows only .mp4, .webm and .webp, as plain file names", () => {
    for (const bad of ["../poster.webp", "a/b.webp", "poster.png", "poster.jpg", "poster.webp.exe"]) {
      expect(avatarManifestSchema.safeParse({ ...base, poster: bad }).success, bad).toBe(false);
    }
    for (const bad of ["i.mov", "i.gif", "dir/i.mp4", "..\\i.mp4", "i.webp"]) {
      expect(avatarManifestSchema.safeParse({ ...base, idle: bad }).success, bad).toBe(false);
    }
    expect(avatarManifestSchema.safeParse({ ...base, idle: { mp4: "i.webm" } }).success).toBe(false); // the key decides the format
    expect(avatarManifestSchema.safeParse({ ...base, idle: {} }).success).toBe(false);
  });

  it("lists the loops and the files of a pack, once each", () => {
    const m = avatarManifestSchema.parse({ ...base, idle: "x.mp4", speak: { mp4: "x.mp4", webm: "x.webm" } });
    expect(avatarLoops(m)).toEqual(["idle", "speak"]);
    expect(loopFiles(m, "idle")).toEqual({ mp4: "x.mp4" });
    expect(loopFiles(m, "listen")).toBeNull();
    expect(avatarFiles(m)).toEqual(["poster.webp", "x.mp4", "x.webm"]);
  });
});

describe("the avatar library on disk", () => {
  it("reads a valid pack and names the library path for an unknown id", () => {
    write(tmp, "pack-a", base);
    const ok = readAvatar(tmp, "pack-a");
    expect(ok.ok).toBe(true);
    const missing = readAvatar(tmp, "nobody");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0]).toBe(`avatar "nobody" is not in the avatar library ${path.join(tmp, "_avatars")}`);
  });

  it("never lets an id leave the library folder", () => {
    for (const id of ["..", "../x", "a/b", "A", ""]) expect(readAvatar(tmp, id).ok, id).toBe(false);
  });

  it("refuses a missing file, an id that differs from the folder, bad JSON and an unknown key", () => {
    write(tmp, "no-file", { ...base, id: "no-file", idle: "idle.mp4" });
    write(tmp, "wrong-id", { ...base, id: "other" });
    write(tmp, "bad-json", "{ nope");
    write(tmp, "extra-key", { ...base, id: "extra-key", color: "red" });
    expect(readAvatar(tmp, "no-file")).toMatchObject({ ok: false, issues: [expect.stringContaining('file "idle.mp4" not found')] });
    expect(readAvatar(tmp, "wrong-id")).toMatchObject({ ok: false, issues: [expect.stringContaining('must equal the folder name "wrong-id"')] });
    expect(readAvatar(tmp, "bad-json")).toMatchObject({ ok: false, issues: [expect.stringContaining("not valid JSON")] });
    expect(readAvatar(tmp, "extra-key")).toMatchObject({ ok: false });
  });

  it("enforces the size limits: 4 MB per video, 300 KB per poster", () => {
    expect(MAX_AVATAR_VIDEO_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_AVATAR_POSTER_BYTES).toBe(300 * 1024);
    write(tmp, "at-limit", { ...base, id: "at-limit", idle: "i.mp4" }, { "poster.webp": MAX_AVATAR_POSTER_BYTES, "i.mp4": MAX_AVATAR_VIDEO_BYTES });
    write(tmp, "big-video", { ...base, id: "big-video", idle: "i.mp4" }, { "poster.webp": 10, "i.mp4": MAX_AVATAR_VIDEO_BYTES + 1 });
    write(tmp, "big-poster", { ...base, id: "big-poster" }, { "poster.webp": MAX_AVATAR_POSTER_BYTES + 1 });
    expect(readAvatar(tmp, "at-limit").ok).toBe(true);
    expect(readAvatar(tmp, "big-video")).toMatchObject({ ok: false, issues: [expect.stringContaining("more than the 4.0 MB limit for an avatar video")] });
    expect(readAvatar(tmp, "big-poster")).toMatchObject({ ok: false, issues: [expect.stringContaining("limit for a poster")] });
  });

  it("listAvatars returns { id, name, voiceHint, poster, loops } sorted by id, and leaves a broken pack out", () => {
    const root = path.join(tmp, "list");
    write(root, "b-pack", { ...base, id: "b-pack", name: "B", voiceHint: "male", idle: "i.mp4", listen: "l.mp4" }, { "poster.webp": 5, "i.mp4": 5, "l.mp4": 5 });
    write(root, "a-pack", { ...base, id: "a-pack", name: "A" });
    write(root, "broken", "{");
    expect(listAvatars(root)).toEqual([
      { id: "a-pack", name: "A", voiceHint: null, poster: "poster.webp", loops: [] },
      { id: "b-pack", name: "B", voiceHint: "male", poster: "poster.webp", loops: ["idle", "listen"] },
    ]);
    const scan = scanAvatars(root);
    expect(scan.avatars).toHaveLength(2);
    expect(scan.problems).toHaveLength(1);
  });

  it("a content root without a library lists nothing", () => {
    expect(listAvatars(path.join(tmp, "empty"))).toEqual([]);
  });

  it("the template's example library is valid and holds only a synthetic pack", () => {
    const { avatars, problems } = scanAvatars(examples.root);
    expect(problems).toEqual([]);
    expect(avatars.map((a) => a.id)).toEqual(["example-avatar"]);
  });
});
