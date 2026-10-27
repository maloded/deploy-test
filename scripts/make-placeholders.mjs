// Generates plain gradient PNG placeholders (no dependencies) for the sample products.
// Usage: node scripts/make-placeholders.mjs   (overwrites the example images under examples/)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = process.cwd();

// each example product lives in a fake seller's folder: examples/<seller>/<slug> (found, not named here)
const examplesDir = path.join(root, "examples");
const productDir = (slug) => {
  const seller = fs.readdirSync(examplesDir, { withFileTypes: true }).find((e) => e.isDirectory() && fs.existsSync(path.join(examplesDir, e.name, slug, "product.json")));
  if (!seller) throw new Error(`examples/<seller>/${slug}/product.json not found.`);
  return path.join(examplesDir, seller.name, slug);
};

const make = (slug, name, W, H, from, to) => {
  const dir = path.join(productDir(slug), "media");
  fs.mkdirSync(dir, { recursive: true });
  const file = png(W, H, (x, y) => {
    const t = (x / W + y / H) / 2;
    const band = Math.floor((x / W) * 10) % 2 ? 6 : 0; // faint vertical bands so it reads as a placeholder
    return from.map((c, i) => Math.round(c + (to[i] - c) * t) + band);
  });
  fs.writeFileSync(path.join(dir, name), file);
  console.log(`${slug}/${name} ${W}x${H} ${(file.length / 1024).toFixed(0)} KB`);
};

// tiny, matching each product type's default hero ratio
make("example-watch", "hero.png", 400, 400, [90, 90, 110], [30, 30, 50]);
make("example-bag", "hero.png", 320, 400, [150, 120, 100], [90, 60, 50]);
make("example-house", "hero.png", 640, 360, [130, 150, 130], [70, 90, 80]);
