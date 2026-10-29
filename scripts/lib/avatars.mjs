// The avatar library in the media scripts: which packs the content root actually uses (the sellers' agent.avatar.id), and
// copying only those. A pack is already web-ready (a .webp poster and short videos, no EXIF), so it is copied byte for byte.
// Packs no seller selects never leave the library: not to public/avatars, not into a snapshot.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { readAvatar, avatarLibraryDir, scanAvatars } from "../../src/lib/avatar-library.ts";
import { AVATARS_DIR, avatarFiles } from "../../src/lib/avatar-manifest.ts";
import { listSellers } from "../../src/lib/content-root.ts";

export class AvatarError extends Error {}

/** The avatar id a seller selects (plain JSON reading, no schema, like referenced.mjs), or null. */
export function sellerAvatarId(contentDir, seller) {
  try {
    const id = JSON.parse(fs.readFileSync(path.join(contentDir, seller, "seller.json"), "utf8"))?.agent?.avatar?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null; // a missing or unreadable seller.json is reported by the app, not here
  }
}

/** The ids the sellers of a content root select, sorted, once each. */
export function selectedAvatarIds(contentDir) {
  return [...new Set(listSellers(contentDir).map((s) => sellerAvatarId(contentDir, s)).filter(Boolean))].sort();
}

/** A selected pack, checked completely; an AvatarError with every problem when it is not there or broken. */
export function selectedPack(contentDir, id) {
  const r = readAvatar(contentDir, id);
  if (!r.ok) throw new AvatarError(`Cannot use avatar "${id}":\n` + r.issues.map((i) => `  - ${i}`).join("\n"));
  return r;
}

/** Copies a pack's own files (avatar.json is not needed on the site) from the library to `outDir/<id>`; returns the file names. */
export function copyPackFiles(pack, outDir, { withManifest = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const names = [...avatarFiles(pack.avatar), ...(withManifest ? ["avatar.json"] : [])];
  for (const name of names) fs.copyFileSync(path.join(pack.dir, name), path.join(outDir, name));
  return names;
}

/**
 * npm run images: copies the selected packs to `outDir` (public/avatars) and removes whatever else is there (a pack nobody
 * selects any more, a file the manifest no longer names).
 * @returns {{ id: string, files: string[] }[]}
 */
export function makeWebAvatars({ contentDir, outDir, log = () => {} }) {
  const ids = fs.existsSync(contentDir) ? selectedAvatarIds(contentDir) : [];
  const packs = ids.map((id) => selectedPack(contentDir, id));
  fs.rmSync(outDir, { recursive: true, force: true });
  if (packs.length === 0) return [];
  const done = packs.map((pack) => ({ id: pack.avatar.id, files: copyPackFiles(pack, path.join(outDir, pack.avatar.id)) }));
  for (const d of done) log(`avatar ${d.id}: ${d.files.length} file(s) copied as they are`);
  return done;
}

/**
 * npm run images:export: the selected packs, checked, with their size; and the packs of the library nobody selects ("skipped
 * (not used)"). Nothing is written: a pack has no originals to process.
 * @returns {Promise<{ used: { id: string, files: { file: string, bytes: number }[] }[], skipped: string[] }>}
 */
export async function reportAvatars(contentDir) {
  const ids = selectedAvatarIds(contentDir);
  const used = [];
  for (const id of ids) {
    const pack = selectedPack(contentDir, id);
    // the poster travels as it is, so it must already be free of metadata (GPS, camera): the snapshot refuses it otherwise
    const meta = await sharp(fs.readFileSync(path.join(pack.dir, pack.avatar.poster)), { failOn: "none" }).metadata();
    if (meta.exif) throw new AvatarError(`Cannot use avatar "${id}": poster ${pack.avatar.poster} still has EXIF metadata; save it again without metadata (a pack is copied as it is).`);
    used.push({ id, files: avatarFiles(pack.avatar).map((file) => ({ file, bytes: fs.statSync(path.join(pack.dir, file)).size })) });
  }
  const skipped = scanAvatars(contentDir).avatars.map((a) => a.id).filter((id) => !ids.includes(id));
  return { used, skipped };
}

/** The snapshot of one seller: the selected pack (its files and avatar.json) in `<dest content>/_avatars/<id>`; null without one. */
export function copyAvatarToSnapshot({ contentRoot, seller, destContent }) {
  const id = sellerAvatarId(contentRoot, seller);
  if (!id) return null;
  const pack = selectedPack(contentRoot, id);
  copyPackFiles(pack, path.join(destContent, AVATARS_DIR, id), { withManifest: true });
  return id;
}

export { avatarLibraryDir };
