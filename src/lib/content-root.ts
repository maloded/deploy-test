// Self-contained on purpose (like themes.ts): only Node built-ins, no path aliases, no TypeScript-only syntax
// (annotations are fine, they are erased), so the app, the scripts (plain Node) and the tests import this one file.
//
// Layout of a content root:   <seller>/seller.json     <seller>/<product>/product.json (+ media/, media-web/)
// A product is addressed as "<seller>/<product>" (its folder names).
import fs from "node:fs";
import path from "node:path";

/** Where the products live when CONTENT_DIR is not set, relative to the project root. */
export const DEFAULT_CONTENT_DIR = "content";

type Env = Record<string, string | undefined>;

const PART = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PRODUCT_REF = new RegExp(`^${PART}/${PART}$`);

/** "<seller>/<product>" split into its folder names; throws when it is not in that form. */
export function splitRef(ref: string): { seller: string; product: string } {
  if (!PRODUCT_REF.test(ref)) throw new Error(`"${ref}" is not a product reference. Use <seller>/<product> (lowercase letters, digits and dashes).`);
  const [seller, product] = ref.split("/");
  return { seller, product };
}

/**
 * The content root: CONTENT_DIR, or ./content. A relative value is resolved from the project root (the working
 * directory of the app and of every npm script), an absolute path is used as it is. Does not check the folder.
 */
export function resolveContentDir(env: Env = process.env, projectRoot: string = process.cwd()): string {
  return path.resolve(projectRoot, env.CONTENT_DIR?.trim() || DEFAULT_CONTENT_DIR);
}

const subfolders = (dir: string): string[] =>
  fs.existsSync(/*turbopackIgnore: true*/ dir)
    ? fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];

/** Every product under `dir` as "<seller>/<product>": a folder two levels down that holds a product.json. Sorted. */
export function listProducts(dir: string): string[] {
  return subfolders(dir).flatMap((seller) =>
    subfolders(path.join(dir, seller))
      .filter((product) => fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, seller, product, "product.json")))
      .map((product) => `${seller}/${product}`),
  );
}

/** Folders directly under `dir` that hold a product.json: the layout from before seller folders. */
export function listLegacyProducts(dir: string): string[] {
  return subfolders(dir).filter((name) => fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, name, "product.json")));
}

/** The seller folders of a content root: those that hold a seller.json or at least one product. */
export function listSellers(dir: string): string[] {
  return subfolders(dir).filter(
    (name) => fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, name, "seller.json")) || listProducts(dir).some((p) => p.startsWith(`${name}/`)),
  );
}

/** The content root, checked: it must exist and hold at least one <seller>/<product>/product.json. Throws with a message that says what to do. */
export function contentRoot(env: Env = process.env, projectRoot: string = process.cwd()): string {
  const dir = resolveContentDir(env, projectRoot);
  const source = env.CONTENT_DIR?.trim() ? `CONTENT_DIR is "${env.CONTENT_DIR.trim()}"` : `CONTENT_DIR is not set, so the default "${DEFAULT_CONTENT_DIR}" is used`;
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir) || !fs.statSync(/*turbopackIgnore: true*/ dir).isDirectory()) {
    throw new Error(`The content folder does not exist: ${dir} (${source}). Create it, or set CONTENT_DIR to a folder that holds <seller>/<product>/product.json (for a quick look at the fake samples: CONTENT_DIR=examples).`);
  }
  if (listProducts(dir).length === 0) {
    const legacy = listLegacyProducts(dir);
    if (legacy.length > 0) {
      throw new Error(`The content folder ${dir} still has the old layout (${legacy.length} <product>/product.json without a seller folder). Run: node scripts/migrate-content.mjs --seller <seller-slug> --root ${dir}`);
    }
    throw new Error(`The content folder holds no product: ${dir} has no <seller>/<product>/product.json (${source}). Add a product folder, or set CONTENT_DIR to the folder that has them (for a quick look at the fake samples: CONTENT_DIR=examples).`);
  }
  return dir;
}

/** The product to show: CONTENT_PRODUCT ("<seller>/<product>"), or the only product in the content root. */
export function contentProduct(env: Env = process.env, root: string = contentRoot(env)): string {
  if (env.CONTENT_SLUG?.trim()) {
    throw new Error("CONTENT_SLUG was replaced by CONTENT_PRODUCT=<seller>/<product>. Rename the variable.");
  }
  const ref = env.CONTENT_PRODUCT?.trim();
  if (ref) {
    splitRef(ref);
    return ref;
  }
  const products = listProducts(root);
  if (products.length === 1) return products[0];
  throw new Error(`CONTENT_PRODUCT is not set and ${root} holds ${products.length} products (${products.join(", ")}). Set CONTENT_PRODUCT to one of them.`);
}
