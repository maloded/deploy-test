import fs from "node:fs";
import path from "node:path";
import { loadProduct, type LoadOptions } from "@/lib/content";
import { listProducts, listSellers } from "@/lib/content-root";
import { buildSite } from "@/lib/site";

/** Small generated photos and a fixture product (one fake seller); the default root of the helpers below. */
export const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "content");
/** Fake example products (house, watch, bag) of one fake seller. */
export const EXAMPLES_DIR = path.join(process.cwd(), "examples");
/**
 * Where the real content is looked for: the folder CONTENT_DIR names (also from .env.local, see vitest.config.ts) when it
 * is set and holds a product, else this repository's own ./content folder. `env` and `cwd` are parameters for the test.
 */
export function realContentRoot(env: Record<string, string | undefined> = process.env, cwd: string = process.cwd()): string {
  const named = env.CONTENT_DIR?.trim();
  if (named) {
    const dir = path.resolve(cwd, named);
    const fake = [path.join(cwd, "examples"), path.join(cwd, "tests", "fixtures")].some((f) => (dir + path.sep).startsWith(f + path.sep));
    try {
      if (!fake && listProducts(dir).length > 0) return dir; // CONTENT_DIR=examples is the template's fake data, not real content
    } catch {
      // not a readable content root: fall back to ./content
    }
  }
  return path.join(cwd, "content");
}
/** The root of the real content (see realContentRoot): the first client's data, whose photos are git-ignored. */
export const CONTENT_DIR = realContentRoot();

/** The only seller folder of a root (examples/ and the fixtures each have one fake seller). */
const onlySeller = (root: string) => {
  const sellers = listSellers(root);
  if (sellers.length !== 1) throw new Error(`${root} should hold exactly one seller folder, found ${sellers.length}`);
  return sellers[0];
};

/** Helpers bound to one seller folder of a content root, so a test names a product by its slug only. */
export const inRoot = (root: string, seller: string) => ({
  root,
  seller,
  /** "<seller>/<product>" */
  ref: (slug: string) => `${seller}/${slug}`,
  /** <root>/<seller>/<product> */
  productDir: (slug: string) => path.join(root, seller, slug),
  siteFor: (slug: string, theme: string | null = null) => buildSite(theme, `${seller}/${slug}`, root),
  loadFor: (slug: string, options: LoadOptions = {}) => loadProduct(`${seller}/${slug}`, { contentDir: root, ...options }),
  sampleJson: (slug: string): Record<string, any> => // eslint-disable-line @typescript-eslint/no-explicit-any
    JSON.parse(fs.readFileSync(path.join(root, seller, slug, "product.json"), "utf8")),
  sellerJson: (): Record<string, any> => // eslint-disable-line @typescript-eslint/no-explicit-any
    JSON.parse(fs.readFileSync(path.join(root, seller, "seller.json"), "utf8")),
});

/** Default: the fixture root. Examples and the real content name their root: `examples.siteFor(...)`, `content.siteFor(...)`. */
export const fixtures = inRoot(FIXTURE_DIR, onlySeller(FIXTURE_DIR));
export const { siteFor, loadFor, sampleJson } = fixtures;
export const examples = inRoot(EXAMPLES_DIR, onlySeller(EXAMPLES_DIR));

/** The first client's product in ./content, found by its product slug (no seller name is written here); null in a bare template clone. */
const REAL_PRODUCT = "vw-multivan";
const realRef = listProducts(CONTENT_DIR).find((ref) => ref.endsWith(`/${REAL_PRODUCT}`));
/** False in a bare template clone: the tests that pin the first client's real product are skipped then. */
export const hasRealContent = Boolean(realRef);
export const content = inRoot(CONTENT_DIR, realRef ? realRef.split("/")[0] : "no-real-content");
