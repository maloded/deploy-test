// The seller's optional icon: <content root>/<seller>/icon.svg or icon.png (next to seller.json). Self-contained like root-redirect.ts (the images
// script and the snapshot guard import it with a .ts extension). No logo is invented: without the file there is no <link rel="icon"> and no copy.
import fs from "node:fs";
import path from "node:path";
import { contentProduct, contentRoot, splitRef } from "./content-root.ts";

type Env = Record<string, string | undefined>;

/** The file names looked for, in this order (the first that exists is the icon). */
export const ICON_FILES = ["icon.svg", "icon.png"] as const;
/** An icon is small: a larger file is refused (images step and snapshot guard), never silently shrunk. */
export const MAX_ICON_BYTES = 256 * 1024;

export const ICON_TYPES: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png" };

/** Why a candidate icon file may not be used, or null: too large, or an SVG that carries script or an event handler. */
export function iconProblem(file: string): string | null {
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_ICON_BYTES) return `${path.basename(file)} is ${Math.round(bytes / 1024)} KB; an icon may be at most ${MAX_ICON_BYTES / 1024} KB`;
  if (file.toLowerCase().endsWith(".svg")) {
    const text = fs.readFileSync(file, "utf8");
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(text)) return `${path.basename(file)} contains script or an event handler; an SVG icon must be plain shapes`;
  }
  return null;
}

/** The icon file name of a seller folder (icon.svg, else icon.png), or null when there is none. */
export function sellerIconFile(sellerDir: string): string | null {
  const isFile = (name: string) => fs.existsSync(/*turbopackIgnore: true*/ path.join(sellerDir, name)) && fs.statSync(/*turbopackIgnore: true*/ path.join(sellerDir, name)).isFile();
  return ICON_FILES.find(isFile) ?? null;
}

/** The public path of the served seller's icon (public/media/<seller>/<file>, copied by `npm run images`), or null when the seller has none. */
export function sellerIconHref(env: Env = process.env, projectRoot: string = process.cwd()): { href: string; type: string } | null {
  try {
    const root = contentRoot(env, projectRoot);
    const { seller } = splitRef(contentProduct(env, root));
    const file = sellerIconFile(path.join(root, seller));
    return file ? { href: `/media/${seller}/${file}`, type: ICON_TYPES[path.extname(file)] } : null;
  } catch {
    return null;
  }
}

/** A product's own icon set, next to its product.json: the tab icon (SVG), the classic .ico and the iOS home-screen icon. All optional. */
export const PRODUCT_ICON_FILES = { svg: "icon.svg", ico: "favicon.ico", apple: "apple-touch-icon.png" } as const;
export const PRODUCT_ICON_TYPES: Record<string, string> = { ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png" };

/** The icon files a product folder holds (names only), in a fixed order. */
export function productIconFiles(productDir: string): string[] {
  const isFile = (name: string) => fs.existsSync(/*turbopackIgnore: true*/ path.join(productDir, name)) && fs.statSync(/*turbopackIgnore: true*/ path.join(productDir, name)).isFile();
  return Object.values(PRODUCT_ICON_FILES).filter(isFile);
}

type IconLink = { url: string; type?: string; sizes?: string };
export type SiteIcons = { icon: IconLink[]; apple?: IconLink[] };

/**
 * What the page links as its icons: the served product's own set when it has any (public/media/<seller>/<product>/<file>),
 * else the seller's icon, else null (no link at all: a product without icons gets a neutral, empty default).
 */
export function siteIcons(env: Env = process.env, projectRoot: string = process.cwd()): SiteIcons | null {
  try {
    const root = contentRoot(env, projectRoot);
    const ref = contentProduct(env, root);
    const { seller, product } = splitRef(ref);
    const files = productIconFiles(path.join(root, seller, product));
    if (files.length) {
      const url = (f: string) => `/media/${seller}/${product}/${f}`;
      const icon: IconLink[] = [];
      if (files.includes(PRODUCT_ICON_FILES.svg)) icon.push({ url: url(PRODUCT_ICON_FILES.svg), type: "image/svg+xml" });
      if (files.includes(PRODUCT_ICON_FILES.ico)) icon.push({ url: url(PRODUCT_ICON_FILES.ico), sizes: "any", type: "image/x-icon" });
      const apple = files.includes(PRODUCT_ICON_FILES.apple) ? [{ url: url(PRODUCT_ICON_FILES.apple), type: "image/png" }] : undefined;
      return { icon, ...(apple ? { apple } : {}) };
    }
    const own = sellerIconHref(env, projectRoot);
    return own ? { icon: [{ url: own.href, type: own.type }] } : null;
  } catch {
    return null;
  }
}
