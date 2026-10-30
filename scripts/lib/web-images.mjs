// Builds web-sized copies of <content root>/<seller>/<product>/media into public/media/<seller>/<product>:
// rotation applied, EXIF (GPS included) stripped, long side limited (never enlarged), same file names.
// A music track in media/audio is copied as it is, and only when product.json uses it. The originals are only read. Results are cached: a file is redone only when its source is newer.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { listProducts, listSellers } from "../../src/lib/content-root.ts";
import { OG_HEIGHT, OG_IMAGE_FILE, OG_WIDTH, ogCropBox } from "../../src/lib/og-image.ts";
import { iconProblem, sellerIconFile } from "../../src/lib/seller-icon.ts";
import { readProduct, referencedFiles } from "./referenced.mjs";

const RESIZABLE = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp" };
const STAMP = ".web-images.json";

/** Every file below `dir` as a relative path with forward slashes, sorted. */
function filesBelow(dir, prefix = "") {
  const list = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory()) list.push(...filesBelow(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.isFile()) list.push(`${prefix}${entry.name}`);
  }
  return list;
}

export async function makeWebImages({ contentDir, outDir, longSide = 2000, quality = 80, log = () => {}, warn = console.warn }) {
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
      // music tracks (audio/<name>) are copied only when product.json uses them; the photos keep their old rule (every file)
      const used = new Set(referencedFiles(readProduct(contentDir, slug) ?? {}).map((r) => r.file));
      for (const file of filesBelow(media)) {
        const src = path.join(media, file);
        if (file.includes("/") && !alreadyProcessed && !used.has(file)) continue; // not used: never copied (pruned below)
        const dest = path.join(out, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
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

  // the Open Graph image of every product: gallery photo 1 cut to 1200x630 around its focus, from the web copy made above (so it also works from
  // media-web). A photo smaller than 1200x630 gives no image and a warning (it is never enlarged); the page then has no og:image.
  if (fs.existsSync(contentDir)) {
    for (const slug of listProducts(contentDir)) {
      const first = (readProduct(contentDir, slug) ?? {}).media?.gallery?.[0];
      if (!first?.file) continue;
      const photo = path.join(outDir, slug, first.file);
      if (!fs.existsSync(photo)) continue;
      const dest = path.join(outDir, slug, OG_IMAGE_FILE);
      const meta = await sharp(photo, { failOn: "none" }).metadata();
      const box = ogCropBox(meta.width ?? 0, meta.height ?? 0, first.focus);
      if (!box) {
        warn(`WARNING ${slug}: gallery photo 1 (${first.file}) is ${meta.width}x${meta.height}, smaller than ${OG_WIDTH}x${OG_HEIGHT}: no Open Graph image (it is never enlarged). Use a larger first photo.`);
        continue;
      }
      wanted.add(dest);
      if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(photo).mtimeMs) {
        results.push({ slug, file: OG_IMAGE_FILE, action: "cached" });
        continue;
      }
      await sharp(photo, { failOn: "none" })
        .resize({ width: box.width, height: box.height })
        .extract({ left: box.left, top: box.top, width: OG_WIDTH, height: OG_HEIGHT })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(dest);
      results.push({ slug, file: OG_IMAGE_FILE, action: "derived", width: OG_WIDTH, height: OG_HEIGHT });
    }
  }

  // the seller's optional icon (<seller>/icon.svg or icon.png): copied as it is next to the seller's photos, never resized; a bad one stops the step
  if (fs.existsSync(contentDir)) {
    for (const seller of listSellers(contentDir)) {
      const sellerDir = path.join(contentDir, seller);
      const name = sellerIconFile(sellerDir);
      if (!name) continue;
      const problem = iconProblem(path.join(sellerDir, name));
      if (problem) throw new Error(`${seller}/${problem}`);
      const dest = path.join(outDir, seller, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(sellerDir, name), dest);
      wanted.add(dest);
      results.push({ slug: seller, file: name, action: "copied" });
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
