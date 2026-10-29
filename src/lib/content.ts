import fs from "node:fs";
import path from "node:path";
import { readAvatar } from "./avatar-library";
import { resolveAvatar, type ResolvedAvatar } from "./avatar-manifest";
import { contentRoot, splitRef } from "./content-root";
import { readImageSize } from "./image-size";
import { AUDIO_FILE, MAX_AUDIO_BYTES } from "./music";
import { checkViewing, mergeViewing, missingViewingFields, type ViewingConfig, type ViewingSettings } from "./viewing";
import { completeLocalized, mergeCoverage, reportLocalized, type Coverage } from "./localized";
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
  /** The seller's viewing settings with the product's laid over them, field by field; null when neither has any (then viewing and test drive requests are not offered). */
  viewing: ViewingConfig | null;
  /** Block order: the product's "blocks", or the product type's default; "contact" is always there (last when not listed). */
  blocks: BlockId[];
  /** Images that exist, keyed by file name. A missing file is absent here. */
  images: Record<string, MediaImage>;
  /** Translations that are missing and fall back to the default language: "<file>: <field path>: ...". Warnings, never errors. */
  translationWarnings: string[];
  /** Per offered language: localized fields of the product and the seller that have a text, out of all of them. */
  coverage: Coverage[];
  /** The voice agent's avatar pack, resolved from the shared library; null without agent.avatar. */
  avatar: ResolvedAvatar | null;
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
  const { languages, defaultLanguage } = sellerResult.seller;
  const sellerReport = reportLocalized(sellerResult.seller, languages, defaultLanguage);
  if (sellerReport.missingDefault.length) {
    throw new ContentError(`${sellerSlug}/seller.json`, sellerReport.missingDefault.map((p) => `${p}: no text in the default language "${defaultLanguage}" (only the default language is required)`));
  }
  const seller = completeLocalized(sellerResult.seller, languages, defaultLanguage);

  // the avatar is chosen by id from the shared library; an id that is not there (or a broken pack) stops the build
  let avatar: ResolvedAvatar | null = null;
  if (seller.agent?.avatar) {
    const found = readAvatar(contentDir, seller.agent.avatar.id);
    if (!found.ok) throw new ContentError(`${sellerSlug}/seller.json`, found.issues.map((i) => `agent.avatar.id: ${i}`));
    avatar = resolveAvatar(found.avatar, seller.agent.avatar.name);
  }

  const result = validateProduct(readJson(path.join(/*turbopackIgnore: true*/ dir, "product.json"), `${ref}/product.json`), options.registries ?? defaultRegistries);
  if (!result.ok) throw new ContentError(`${ref}/product.json`, result.issues);
  const { typeFields } = result;
  const file = result.product;

  const issues: string[] = [];
  const report = reportLocalized(file, languages, defaultLanguage);
  for (const p of report.missingDefault) issues.push(`${p}: no text in the default language "${defaultLanguage}" (only the default language is required)`);
  if (file.slug !== slug) issues.push(`slug: is "${file.slug}" but the folder is named "${slug}"`);

  const refs: { where: string; file: string }[] = [{ where: "media.hero", file: file.media.hero }];
  file.media.gallery.forEach((g, i) => refs.push({ where: `media.gallery.${i}.file`, file: g.file }));
  if (file.media.background) refs.push({ where: "media.background", file: file.media.background });
  if (file.media.video && !/^https?:\/\//i.test(file.media.video)) {
    refs.push({ where: "media.video", file: file.media.video });
  }
  if (file.media.videoPoster) refs.push({ where: "media.videoPoster", file: file.media.videoPoster });
  file.music?.tracks.forEach((t, i) => refs.push({ where: `music.tracks.${i}.file`, file: t.file }));

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
    if (AUDIO_FILE.test(r.file)) {
      const bytes = fs.statSync(/*turbopackIgnore: true*/ abs).size;
      if (bytes > MAX_AUDIO_BYTES) issues.push(`${r.where}: file "${r.file}" is ${(bytes / 1048576).toFixed(1)} MB, more than the ${MAX_AUDIO_BYTES / 1048576} MB limit for a music track`);
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

  const completed = completeLocalized(file, languages, defaultLanguage);
  const merged = mergeViewing(seller.viewing as ViewingSettings | undefined, completed.viewing as ViewingSettings | undefined);
  let viewing: ViewingConfig | null = null;
  if (merged) {
    const missing = missingViewingFields(merged);
    if (missing.length) issues.push(`viewing: incomplete after merging the seller's and the product's settings, missing: ${missing.join(", ")}`);
    for (const problem of checkViewing(merged)) issues.push(`viewing.${problem}`);
    if (!missing.length && !issues.some((i) => i.startsWith("viewing."))) viewing = merged as ViewingConfig;
  }

  if (issues.length) throw new ContentError(`${ref}/product.json`, issues);
  const translationWarnings = [
    ...Object.entries(report.missing).flatMap(([lang, paths]) => paths!.map((p) => `${ref}/product.json: ${p}: no "${lang}" text, shows the "${defaultLanguage}" text`)),
    ...Object.entries(sellerReport.missing).flatMap(([lang, paths]) => paths!.map((p) => `${sellerSlug}/seller.json: ${p}: no "${lang}" text, shows the "${defaultLanguage}" text`)),
  ];
  const product: Product = {
    ...completed,
    theme: file.theme ?? seller.theme,
    languages: seller.languages,
    defaultLanguage: seller.defaultLanguage,
    contact: seller.contact,
  };
  const coverage = mergeCoverage([report.coverage, sellerReport.coverage]);
  // the contact block is never left out: the page's "#contact" buttons need it, so a product that lists its own blocks
  // without it gets it last (listing "contact" only decides where it goes)
  const listed = file.blocks ?? defaultBlocksFor(typeFields);
  const blocks: BlockId[] = listed.includes("contact") ? [...listed] : [...listed, "contact"];
  return { ref, seller, product, typeFields, blocks, viewing, images, translationWarnings, coverage, warnings, avatar };
}
