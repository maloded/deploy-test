import fs from "node:fs";
import path from "node:path";
import { contentRoot, splitRef } from "./content-root";
import { readImageSize } from "./image-size";
import { defaultBlocksFor, type ProductTypeFields } from "./fields";
import type { BlockId, Product } from "./schema";
import { validateSeller, type SellerFile } from "./seller";
import { defaultRegistries, validateProduct, type Registries } from "./validate";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

/** Thrown when a product cannot be loaded. `issues` is the human-readable list. */
export class ContentError extends Error {
  issues: string[];
  constructor(what: string, issues: string[]) {
    super(`Cannot load ${what}:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ContentError";
    this.issues = issues;
  }
}

export type MediaImage = { src: string; width: number; height: number };

export type LoadedProduct = {
  /** "<seller>/<product>", the folder names. */
  ref: string;
  /** The seller's seller.json. */
  seller: SellerFile;
  /** product.json merged with the seller (languages, defaultLanguage, contact, and the theme when the product has none). */
  product: Product;
  typeFields: ProductTypeFields;
  /** Block order: the product's "blocks", or the product type's default. */
  blocks: BlockId[];
  /** Images that exist, keyed by file name. A missing file is absent here. */
  images: Record<string, MediaImage>;
  /** Missing media files, only reported (instead of thrown) when `strictMedia` is false. */
  warnings: string[];
};

export type LoadOptions = {
  contentDir?: string;
  /** true (default): a missing referenced media file is an error. false: it becomes a warning. */
  strictMedia?: boolean;
  /** Product and offer type registries; defaults to the real ones (tests inject extended ones). */
  registries?: Registries;
};

function readJson(file: string, what: string): unknown {
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) throw new ContentError(what, [`file not found: ${file}`]);
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
  } catch (e) {
    throw new ContentError(what, [`not valid JSON: ${(e as Error).message}`]);
  }
}

/** Loads <content root>/<seller>/<product> and merges the seller's seller.json into the product. `ref` is "<seller>/<product>". */
export function loadProduct(ref: string, options: LoadOptions = {}): LoadedProduct {
  const { seller: sellerSlug, product: slug } = splitRef(ref);
  const contentDir = options.contentDir ?? contentRoot();
  const strictMedia = options.strictMedia ?? true;
  const sellerDir = path.join(/*turbopackIgnore: true*/ contentDir, sellerSlug);
  const dir = path.join(/*turbopackIgnore: true*/ sellerDir, slug);

  const sellerResult = validateSeller(readJson(path.join(/*turbopackIgnore: true*/ sellerDir, "seller.json"), `${sellerSlug}/seller.json`));
  if (!sellerResult.ok) throw new ContentError(`${sellerSlug}/seller.json`, sellerResult.issues);
  const seller = sellerResult.seller;

  const result = validateProduct(readJson(path.join(/*turbopackIgnore: true*/ dir, "product.json"), `${ref}/product.json`), options.registries ?? defaultRegistries);
  if (!result.ok) throw new ContentError(`${ref}/product.json`, result.issues);
  const { typeFields } = result;
  const file = result.product;

  const issues: string[] = [];
  if (file.slug !== slug) issues.push(`slug: is "${file.slug}" but the folder is named "${slug}"`);

  const refs: { where: string; file: string }[] = [{ where: "media.hero", file: file.media.hero }];
  file.media.gallery.forEach((g, i) => refs.push({ where: `media.gallery.${i}.file`, file: g.file }));
  if (file.media.background) refs.push({ where: "media.background", file: file.media.background });
  if (file.media.video && !/^https?:\/\//i.test(file.media.video)) {
    refs.push({ where: "media.video", file: file.media.video });
  }
  if (file.media.videoPoster) refs.push({ where: "media.videoPoster", file: file.media.videoPoster });

  // the originals when they are here, otherwise the processed export (npm run images:export)
  const mediaDirName = fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, "media")) ? "media" : "media-web";

  const images: Record<string, MediaImage> = {};
  const warnings: string[] = [];
  for (const r of refs) {
    const abs = path.join(/*turbopackIgnore: true*/ dir, mediaDirName, r.file);
    if (!fs.existsSync(/*turbopackIgnore: true*/ abs)) {
      const msg = `${r.where}: file "${r.file}" not found in ${ref}/${mediaDirName}/`;
      (strictMedia ? issues : warnings).push(msg);
      continue;
    }
    if (IMAGE_EXT.test(r.file) && !images[r.file]) {
      try {
        const { width, height } = readImageSize(abs);
        images[r.file] = { src: `/media/${ref}/${r.file}`, width, height };
      } catch (e) {
        issues.push(`${r.where}: ${(e as Error).message}`);
      }
    }
  }

  if (issues.length) throw new ContentError(`${ref}/product.json`, issues);
  const product: Product = {
    ...file,
    theme: file.theme ?? seller.theme,
    languages: seller.languages,
    defaultLanguage: seller.defaultLanguage,
    contact: seller.contact,
  };
  return { ref, seller, product, typeFields, blocks: [...(file.blocks ?? defaultBlocksFor(typeFields))], images, warnings };
}
