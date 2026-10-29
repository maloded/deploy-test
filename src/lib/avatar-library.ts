// The shared avatar library on disk: <content root>/_avatars/<id>/avatar.json plus its files. Server side and scripts only
// (it reads files); the manifest rules are in avatar-manifest.ts.
import fs from "node:fs";
import path from "node:path";
import {
  AVATARS_DIR,
  AVATAR_ID,
  MAX_AVATAR_POSTER_BYTES,
  MAX_AVATAR_VIDEO_BYTES,
  avatarFiles,
  avatarLoops,
  avatarManifestSchema,
  type AvatarListing,
  type AvatarManifest,
} from "./avatar-manifest.ts";

/** The library folder of a content root (it may not exist: a content root without avatars is normal). */
export const avatarLibraryDir = (contentDir: string): string => path.join(contentDir, AVATARS_DIR);

export type AvatarResult = { ok: true; avatar: AvatarManifest; dir: string } | { ok: false; issues: string[] };

const mb = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * One pack, checked completely: the manifest (strict), the id equal to the folder name, every named file present, and the
 * size limits. `issues` are plain lines for the author. The id is validated before it touches a path.
 */
export function readAvatar(contentDir: string, id: string): AvatarResult {
  const library = avatarLibraryDir(contentDir);
  const dir = path.join(library, id);
  if (!AVATAR_ID.test(id) || !fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, "avatar.json"))) {
    return { ok: false, issues: [`avatar "${id}" is not in the avatar library ${library}`] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ path.join(dir, "avatar.json"), "utf8"));
  } catch (e) {
    return { ok: false, issues: [`${AVATARS_DIR}/${id}/avatar.json is not valid JSON (${(e as Error).message})`] };
  }
  const parsed = avatarManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${AVATARS_DIR}/${id}/avatar.json: ${[...i.path].join(".") || "(root)"}: ${i.message}`) };
  }
  const avatar = parsed.data;
  const issues: string[] = [];
  if (avatar.id !== id) issues.push(`${AVATARS_DIR}/${id}/avatar.json: id "${avatar.id}" must equal the folder name "${id}"`);
  for (const file of avatarFiles(avatar)) {
    const abs = path.join(dir, file);
    if (!fs.existsSync(/*turbopackIgnore: true*/ abs)) {
      issues.push(`${AVATARS_DIR}/${id}: file "${file}" not found`);
      continue;
    }
    const bytes = fs.statSync(/*turbopackIgnore: true*/ abs).size;
    const poster = file === avatar.poster;
    const limit = poster ? MAX_AVATAR_POSTER_BYTES : MAX_AVATAR_VIDEO_BYTES;
    if (bytes > limit) issues.push(`${AVATARS_DIR}/${id}: file "${file}" is ${mb(bytes)}, more than the ${mb(limit)} limit for ${poster ? "a poster" : "an avatar video"}`);
  }
  return issues.length ? { ok: false, issues } : { ok: true, avatar, dir };
}

/** Every folder of the library, sorted (a folder whose name starts with "." is ignored). */
function packFolders(contentDir: string): string[] {
  const library = avatarLibraryDir(contentDir);
  if (!fs.existsSync(/*turbopackIgnore: true*/ library)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ library, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/** The valid packs of the library and, apart, one line for each pack that is broken (a picker keeps working with the rest). */
export function scanAvatars(contentDir: string): { avatars: AvatarListing[]; problems: string[] } {
  const avatars: AvatarListing[] = [];
  const problems: string[] = [];
  for (const id of packFolders(contentDir)) {
    const r = readAvatar(contentDir, id);
    if (!r.ok) {
      problems.push(...r.issues);
      continue;
    }
    const { avatar } = r;
    avatars.push({ id: avatar.id, name: avatar.name, voiceHint: avatar.voiceHint ?? null, poster: avatar.poster, loops: avatarLoops(avatar) });
  }
  return { avatars, problems };
}

/** What a picker lists: [{ id, name, voiceHint, poster, loops }] of every valid pack, sorted by id. Pure data, no rendering. */
export const listAvatars = (contentDir: string): AvatarListing[] => scanAvatars(contentDir).avatars;
