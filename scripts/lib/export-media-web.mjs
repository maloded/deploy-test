// npm run images:export: writes ONLY the files that product.json uses, processed for the web, to
// <content root>/<seller>/<product>/media-web/ (rotation applied, EXIF and GPS stripped, long side limited, never enlarged).
// Photos that no product.json uses are listed as "skipped (not used)" and never exported. Files in media-web that
// are no longer needed are removed. The originals are only read.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { listProducts } from "../../src/lib/content-root.ts";
import { readProduct, referencedFiles } from "./referenced.mjs";

const RESIZABLE = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp" };

export class ExportError extends Error {}

/** Every file below `dir` as a relative path with forward slashes, sorted (the music tracks live in media/audio). */
function filesBelow(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory()) out.push(...filesBelow(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.isFile()) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

/**
 * @param {{ contentDir: string, longSide?: number, quality?: number, products?: string[], log?: (line: string) => void }} options products: "<seller>/<product>" references (default: all)
 * @returns {Promise<{ slug: string, exported: { file: string, note: string, bytes: number }[], skipped: string[], removed: string[] }[]>}
 */
export async function exportMediaWeb({ contentDir, longSide = 2000, quality = 80, products, log = () => {} }) {
  // an explicit list is checked folder by folder: nothing else under the content root is read
  const chosen = products ? products.filter((ref) => fs.existsSync(path.join(contentDir, ref, "product.json"))) : listProducts(contentDir);
  /** @type {Awaited<ReturnType<typeof exportMediaWeb>>} */
  const report = [];

  for (const slug of chosen) {
    const product = readProduct(contentDir, slug);
    const media = path.join(contentDir, slug, "media");
    const out = path.join(contentDir, slug, "media-web");
    if (!fs.existsSync(media)) {
      log(`${slug}: no media folder here (nothing to export; media-web is used as it is)`);
      continue;
    }
    const refs = referencedFiles(product);
    const missing = refs.filter((r) => !fs.existsSync(path.join(media, r.file)));
    if (missing.length) {
      throw new ExportError(
        `Cannot export ${slug}: ${missing.length} file(s) used by product.json are missing in ${slug}/media/:\n` +
          missing.map((m) => `  - ${m.file} (${m.places.join(", ")})`).join("\n"),
      );
    }

    fs.mkdirSync(out, { recursive: true });
    const wanted = new Set(refs.map((r) => r.file));
    /** @type {{ slug: string, exported: { file: string, note: string, bytes: number }[], skipped: string[], removed: string[] }} */
    const result = { slug, exported: [], skipped: [], removed: [] };

    for (const { file } of refs) {
      const src = path.join(media, file);
      const dest = path.join(out, file);
      const format = RESIZABLE[path.extname(file).toLowerCase()];
      if (!format) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        // a local video, a music track or another file: copied as it is (byte for byte, never re-encoded); an identical copy is left alone
        const same = fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(src));
        if (!same) fs.copyFileSync(src, dest);
        result.exported.push({ file, note: "copied as it is", bytes: fs.statSync(dest).size });
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      let img = sharp(src, { failOn: "none" })
        .rotate() // applies the EXIF orientation; sharp drops all metadata (EXIF, GPS) on output
        .resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true });
      img = format === "jpeg" ? img.jpeg({ quality, mozjpeg: true }) : format === "png" ? img.png({ compressionLevel: 9 }) : img.webp({ quality });
      const info = await img.toFile(dest);
      result.exported.push({ file, note: `${info.width}x${info.height}`, bytes: info.size });
    }

    for (const file of filesBelow(media)) if (!wanted.has(file)) result.skipped.push(file);
    // stale outputs: a top-level entry that holds no wanted file goes as a whole (and is reported by its name); inside a folder
    // that holds wanted files (audio/) only the stale files go
    const folders = new Set([...wanted].filter((f) => f.includes("/")).map((f) => f.split("/")[0]));
    for (const entry of fs.readdirSync(out)) {
      const full = path.join(out, entry);
      if (folders.has(entry) && fs.statSync(full).isDirectory()) {
        for (const file of filesBelow(full, `${entry}/`)) {
          if (!wanted.has(file)) {
            fs.rmSync(path.join(out, file), { force: true });
            result.removed.push(file);
          }
        }
      } else if (!wanted.has(entry)) {
        fs.rmSync(full, { recursive: true, force: true });
        result.removed.push(entry);
      }
    }
    // a folder that lost its last file (a dropped track leaves audio/ behind) goes too
    for (const entry of fs.readdirSync(out, { withFileTypes: true })) {
      const full = path.join(out, entry.name);
      if (entry.isDirectory() && filesBelow(full).length === 0) fs.rmSync(full, { recursive: true, force: true });
    }

    for (const e of result.exported) log(`${slug}/${e.file}: exported (${e.note}, ${(e.bytes / 1024).toFixed(0)} KB)`);
    for (const f of result.skipped) log(`${slug}/${f}: skipped (not used)`);
    for (const f of result.removed) log(`${slug}/${f}: removed (stale)`);
    report.push(result);
  }
  return report;
}
