// Builds web-sized copies of <content root>/<seller>/<product>/media into public/media/<seller>/<product>:
// rotation applied, EXIF (GPS included) stripped, long side limited (never enlarged), same file names.
// The originals are only read. Results are cached: a file is redone only when its source is newer.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { listProducts } from "../../src/lib/content-root.ts";

const RESIZABLE = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp" };
const STAMP = ".web-images.json";

export async function makeWebImages({ contentDir, outDir, longSide = 2000, quality = 80, log = () => {} }) {
  const settings = { version: 2, longSide, quality }; // 2: public/media/<seller>/<product>/ (1 was <product>/)
  const stampFile = path.join(outDir, STAMP);
  let cached = false;
  try {
    cached = JSON.stringify(JSON.parse(fs.readFileSync(stampFile, "utf8"))) === JSON.stringify(settings);
  } catch {
    cached = false;
  }
  if (!cached) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  const wanted = new Set();
  if (fs.existsSync(contentDir)) {
    for (const slug of listProducts(contentDir)) { // "<seller>/<product>"
      // the originals when they are here; otherwise the already processed export (media-web), copied as it is
      let media = path.join(contentDir, slug, "media");
      let alreadyProcessed = false;
      if (!fs.existsSync(media) || !fs.statSync(media).isDirectory()) {
        media = path.join(contentDir, slug, "media-web");
        alreadyProcessed = true;
        if (!fs.existsSync(media) || !fs.statSync(media).isDirectory()) continue;
      }
      const out = path.join(outDir, slug);
      fs.mkdirSync(out, { recursive: true });
      for (const file of fs.readdirSync(media).sort()) {
        const src = path.join(media, file);
        if (!fs.statSync(src).isFile()) continue;
        const dest = path.join(out, file);
        wanted.add(dest);

        if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
          results.push({ slug, file, action: "cached" });
          continue;
        }
        const format = RESIZABLE[path.extname(file).toLowerCase()];
        if (!format || alreadyProcessed) {
          fs.copyFileSync(src, dest); // video, svg, gif, ... and everything from media-web: copied as they are
          results.push({ slug, file, action: "copied" });
          continue;
        }
        let img = sharp(src, { failOn: "none" })
          .rotate() // applies the EXIF orientation; sharp drops all metadata (EXIF, GPS) on output
          .resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true });
        img = format === "jpeg" ? img.jpeg({ quality, mozjpeg: true }) : format === "png" ? img.png({ compressionLevel: 9 }) : img.webp({ quality });
        const info = await img.toFile(dest);
        results.push({ slug, file, action: "resized", width: info.width, height: info.height, bytes: info.size, sourceBytes: fs.statSync(src).size });
      }
    }
  }

  // remove outputs whose source is gone, and folders that became empty
  const prune = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        prune(full);
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      } else if (!wanted.has(full)) {
        fs.rmSync(full);
      }
    }
  };
  prune(outDir);

  fs.writeFileSync(stampFile, JSON.stringify(settings));
  for (const r of results) {
    if (r.action === "resized") log(`${r.slug}/${r.file}: ${r.width}x${r.height}, ${(r.sourceBytes / 1024).toFixed(0)} KB -> ${(r.bytes / 1024).toFixed(0)} KB`);
  }
  return results;
}
