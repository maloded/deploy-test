import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveAvatar } from "@/lib/avatar-manifest";
import { avatarFiles, avatarLoops, avatarManifestSchema, inviteCue, loopFiles, MAX_AVATAR_POSTER_BYTES, MAX_AVATAR_VIDEO_BYTES } from "@/lib/avatar-manifest";
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

  describe("the invite loop and its cue", () => {
    const ok = (invite: unknown) => avatarManifestSchema.safeParse({ ...base, invite }).success;
    it("is a loop like the others: a file name, or one file per format", () => {
      expect(ok("invite.mp4")).toBe(true);
      expect(ok({ mp4: "invite.mp4", webm: "invite.webm" })).toBe(true);
      expect(ok({ webm: "invite.webm" })).toBe(true);
      expect(ok({ mp4: "invite.webm" })).toBe(false); // the key decides the format
      expect(ok("../invite.mp4")).toBe(false);
      expect(ok("invite.gif")).toBe(false);
      expect(ok({})).toBe(false);
      expect(ok({ cue: { show: 1, hide: 2 } })).toBe(false); // a cue is not a file
    });
    it("takes an optional cue { show, hide } in seconds, hide later than show, and nothing else", () => {
      const f = { mp4: "invite.mp4", webm: "invite.webm" };
      expect(ok({ ...f, cue: { show: 0.58, hide: 2.45 } })).toBe(true);
      expect(ok({ ...f, cue: { show: 0, hide: 0.1 } })).toBe(true);
      expect(ok({ ...f, cue: { show: 2, hide: 2 } })).toBe(false);
      expect(ok({ ...f, cue: { show: 3, hide: 1 } })).toBe(false);
      expect(ok({ ...f, cue: { show: -1, hide: 1 } })).toBe(false);
      expect(ok({ ...f, cue: { show: 0.5 } })).toBe(false);
      expect(ok({ ...f, cue: { show: "0.5", hide: 2 } })).toBe(false);
      expect(ok({ ...f, cue: { show: 1, hide: 2, extra: 1 } })).toBe(false);
      expect(ok({ ...f, cue: { show: 1, hide: 601 } })).toBe(false);
      expect(ok({ ...f, extra: 1 })).toBe(false);
    });
    it("no other loop can have a cue (strict)", () => {
      expect(avatarManifestSchema.safeParse({ ...base, idle: { mp4: "i.mp4", cue: { show: 1, hide: 2 } } }).success).toBe(false);
    });
    it("is listed first, its files travel with the pack without the cue, and inviteCue reads it", () => {
      const m = avatarManifestSchema.parse({ ...base, speak: "s.mp4", invite: { mp4: "v.mp4", webm: "v.webm", cue: { show: 0.58, hide: 2.45 } }, idle: "i.mp4" });
      expect(avatarLoops(m)).toEqual(["invite", "idle", "speak"]);
      expect(loopFiles(m, "invite")).toEqual({ mp4: "v.mp4", webm: "v.webm" });
      expect(avatarFiles(m)).toEqual(["poster.webp", "v.mp4", "v.webm", "i.mp4", "s.mp4"]);
      expect(inviteCue(m)).toEqual({ show: 0.58, hide: 2.45 });
      expect(inviteCue(avatarManifestSchema.parse({ ...base, invite: "v.mp4" }))).toBeNull();
      expect(inviteCue(avatarManifestSchema.parse(base))).toBeNull();
    });
    it("reaches the card as URLs and a cue (null without one)", () => {
      const m = avatarManifestSchema.parse({ ...base, id: "p", invite: { mp4: "v.mp4", webm: "v.webm", cue: { show: 0.58, hide: 2.45 } } });
      const r = resolveAvatar(m);
      expect(r.invite).toEqual({ mp4: "/avatars/p/v.mp4", webm: "/avatars/p/v.webm" });
      expect(r.inviteCue).toEqual({ show: 0.58, hide: 2.45 });
      const plain = resolveAvatar(avatarManifestSchema.parse({ ...base, id: "p", invite: "v.mp4" }));
      expect(plain.invite).toEqual({ mp4: "/avatars/p/v.mp4" });
      expect(plain.inviteCue).toBeNull();
      expect(resolveAvatar(avatarManifestSchema.parse({ ...base, id: "p" })).invite).toBeNull();
    });
    it("has the same file limits as the other clips: 4 MB, and a missing file stops the build", () => {
      write(tmp, "inv-ok", { ...base, id: "inv-ok", invite: { mp4: "v.mp4" } }, { "poster.webp": 10, "v.mp4": MAX_AVATAR_VIDEO_BYTES });
      write(tmp, "inv-big", { ...base, id: "inv-big", invite: { mp4: "v.mp4" } }, { "poster.webp": 10, "v.mp4": MAX_AVATAR_VIDEO_BYTES + 1 });
      write(tmp, "inv-none", { ...base, id: "inv-none", invite: { mp4: "v.mp4" } });
      expect(readAvatar(tmp, "inv-ok").ok).toBe(true);
      expect(readAvatar(tmp, "inv-big")).toMatchObject({ ok: false, issues: [expect.stringContaining('file "v.mp4" is')] });
      expect(readAvatar(tmp, "inv-none")).toMatchObject({ ok: false, issues: [expect.stringContaining('file "v.mp4" not found')] });
    });
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
    expect(avatars[0].loops).toEqual(["invite"]); // a synthetic invite loop with a cue, for the template's examples
  });
});
