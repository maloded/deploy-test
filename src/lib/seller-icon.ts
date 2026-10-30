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
