// Which files of content/<slug>/media a product.json actually uses: hero, gallery photos, video poster,
// background and a local video file. Plain JSON reading (no schema), so scripts need no build step.
import fs from "node:fs";
import path from "node:path";

export function referencedFiles(product) {
  const media = product.media ?? {};
  const list = [];
  const add = (where, file) => file && typeof file === "string" && list.push({ where, file });
  add("media.hero", media.hero);
  (media.gallery ?? []).forEach((g, i) => add(`media.gallery.${i}.file`, g?.file));
  add("media.videoPoster", media.videoPoster);
  add("media.background", media.background);
  if (typeof media.video === "string" && !/^https?:\/\//i.test(media.video)) add("media.video", media.video);
  // a file can be used twice (hero and gallery photo 1): keep one entry per file, remember every place
  const byFile = new Map();
  for (const { where, file } of list) byFile.set(file, [...(byFile.get(file) ?? []), where]);
  return [...byFile].map(([file, places]) => ({ file, places }));
}

export function readProduct(contentDir, slug) {
  const file = path.join(contentDir, slug, "product.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
