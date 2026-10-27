// Generates the small fixture photos used by the tests (the real photos are git-ignored).
// Usage: node tests/fixtures/make-fixtures.mjs   (output is committed; re-run only to change fixtures)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// the fixture product lives in the fixture seller's folder: content/<seller>/fixture-car (found, not named here)
const contentDir = path.join(import.meta.dirname, "content");
const sellerFolder = fs.readdirSync(contentDir, { withFileTypes: true }).find((e) => e.isDirectory() && fs.existsSync(path.join(contentDir, e.name, "fixture-car", "product.json")));
if (!sellerFolder) throw new Error("content/<seller>/fixture-car/product.json not found: the fixture product defines the folder.");
const dir = path.join(contentDir, sellerFolder.name, "fixture-car", "media");
fs.mkdirSync(dir, { recursive: true });

/** A smooth gradient, so the JPEG stays tiny. */
function gradient(width, height, from, to) {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) buf[o + c] = Math.round(from[c] + (to[c] - from[c]) * t);
    }
  }
  return sharp(buf, { raw: { width, height, channels: 3 } });
}

// fake GPS position (Null Island area), only there to prove that the web-image script strips it
const GPS = {
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "0/1 1/1 0/1",
    GPSLongitudeRef: "E",
    GPSLongitude: "0/1 1/1 0/1",
  },
};

async function write(name, image, { exif, orientation } = {}) {
  let img = image;
  if (exif) img = img.withExif(exif);
  if (orientation) img = img.withMetadata({ orientation });
  const file = path.join(dir, name);
  await img.jpeg({ quality: 60 }).toFile(file);
  console.log(name, `${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
}

await write("hero.jpg", gradient(1200, 800, [120, 138, 156], [48, 64, 88]));
await write("photo-1.jpg", gradient(1200, 800, [150, 150, 140], [90, 96, 100]));
await write("photo-2.jpg", gradient(1200, 800, [110, 130, 120], [50, 70, 70]));
await write("photo-3.jpg", gradient(1200, 800, [160, 140, 120], [100, 80, 70]));
await write("photo-4.jpg", gradient(1200, 800, [130, 120, 150], [70, 60, 90]));
// ratios for the hero fit rule: 4:3 landscape, an upright portrait (2:3) and a 3:1 panorama (3:2 is hero.jpg)
await write("landscape-43.jpg", gradient(1200, 900, [120, 120, 150], [60, 60, 100]));
await write("portrait.jpg", gradient(800, 1200, [150, 130, 110], [90, 70, 60]));
await write("panorama.jpg", gradient(2400, 800, [110, 140, 150], [50, 80, 90]));
await write("poster.jpg", gradient(640, 360, [60, 60, 70], [20, 20, 30]));
// stored sideways (1600x1200) with EXIF orientation 6: displayed as portrait 1200x1600; with GPS
await write("sideways.jpg", gradient(1600, 1200, [140, 110, 100], [80, 50, 50]), { exif: GPS, orientation: 6 });
// larger than the web size limit, with GPS
await write("big.jpg", gradient(3000, 2000, [100, 120, 140], [40, 60, 80]), { exif: GPS });

// not a real video: tests only need the file to exist
fs.writeFileSync(path.join(dir, "clip.mp4"), Buffer.from("fixture video placeholder"));
