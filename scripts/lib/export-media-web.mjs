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
        fs.copyFileSync(src, dest); // a local video or another file: copied as it is
        result.exported.push({ file, note: "copied as it is", bytes: fs.statSync(dest).size });
        continue;
      }
      let img = sharp(src, { failOn: "none" })
        .rotate() // applies the EXIF orientation; sharp drops all metadata (EXIF, GPS) on output
        .resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true });
      img = format === "jpeg" ? img.jpeg({ quality, mozjpeg: true }) : format === "png" ? img.png({ compressionLevel: 9 }) : img.webp({ quality });
      const info = await img.toFile(dest);
      result.exported.push({ file, note: `${info.width}x${info.height}`, bytes: info.size });
    }

    for (const file of fs.readdirSync(media).sort()) {
      if (!wanted.has(file) && fs.statSync(path.join(media, file)).isFile()) result.skipped.push(file);
    }
    for (const file of fs.readdirSync(out)) {
      if (!wanted.has(file)) {
        fs.rmSync(path.join(out, file), { recursive: true, force: true });
        result.removed.push(file);
      }
    }

    for (const e of result.exported) log(`${slug}/${e.file}: exported (${e.note}, ${(e.bytes / 1024).toFixed(0)} KB)`);
    for (const f of result.skipped) log(`${slug}/${f}: skipped (not used)`);
    for (const f of result.removed) log(`${slug}/${f}: removed (stale)`);
    report.push(result);
  }
  return report;
}
