// What must never be in a demo snapshot, and the check that enforces it (used by scripts/make-demo-snapshot.mjs).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PHOTO_EXT = /\.(jpe?g|heic|heif|tiff?|raw|dng|cr2|nef|arw)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i;
const MAX_ORIGINAL_BYTES = 1024 * 1024;

/** Why a path (relative, with forward slashes) is not allowed in the snapshot, or null when it is fine. */
export function forbiddenReason(rel, bytes = 0) {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (parts.includes("node_modules")) return "node_modules";
  if (parts.includes(".git")) return ".git folder";
  if (parts.includes(".private")) return ".private folder (private term list)";
  if (/(^|\/)data\/leads(\/|$)/.test(rel)) return "data/leads (visitor data)"; // at any depth, also inside a content folder
  if (base.startsWith(".env") && base !== ".env.example") return ".env file (secrets)"; // .env.example lists variable names only
  if (/^content\/[^/]+\/(?:[^/]+\/)?media\//.test(rel)) { // content/<seller>/<product>/media (and the layout from before seller folders)
    if (PHOTO_EXT.test(base)) return "an original photo (content/<seller>/<product>/media)";
    if (bytes > MAX_ORIGINAL_BYTES) return "a large file in content/<seller>/<product>/media (looks like an original)";
  }
  return null;
}

/** @returns {{ rel: string, full: string, bytes: number }[]} every file under dir, sorted, with forward-slash relative paths */
export function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push({ rel: path.relative(base, full).split(path.sep).join("/"), full, bytes: fs.statSync(full).size });
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/**
 * Checks every file of a snapshot folder. Returns the list of problems (empty = fine):
 * forbidden paths, and images (outside tests/fixtures, whose fake GPS tag is on purpose) that still carry EXIF.
 */
export async function checkSnapshot(dir) {
  const problems = [];
  for (const f of walk(dir)) {
    const reason = forbiddenReason(f.rel, f.bytes);
    if (reason) problems.push(`${f.rel}: ${reason}`);
    if (IMAGE_EXT.test(f.rel) && !f.rel.startsWith("tests/fixtures/")) {
      try {
        const meta = await sharp(f.full, { failOn: "none" }).metadata();
        if (meta.exif) problems.push(`${f.rel}: still has EXIF metadata (GPS and camera data); export it with npm run images:export`);
      } catch {
        problems.push(`${f.rel}: cannot be read as an image`);
      }
    }
  }
  return problems;
}
