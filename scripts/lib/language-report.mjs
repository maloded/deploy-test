// The translation report: for every product of a content root, the coverage per language and the fields that fall back to
// the default language. Printed by npm run check:languages and by the content scan test; the production build logs the same
// numbers from the loader (src/lib/content.ts). It reads the JSON files as they are (validation is the loader's job).
import fs from "node:fs";
import path from "node:path";
import { listProducts, splitRef } from "../../src/lib/content-root.ts";
import { coverageLine, mergeCoverage, reportLocalized } from "../../src/lib/localized.ts";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/**
 * @param {string} contentRoot
 * @returns {{ lines: string[], warnings: string[] }} lines: one coverage line per product; warnings: every field path with no translation
 */
export function languageReport(contentRoot) {
  const lines = [];
  const warnings = [];
  for (const ref of listProducts(contentRoot)) {
    const { seller: sellerSlug } = splitRef(ref);
    const seller = readJson(path.join(contentRoot, sellerSlug, "seller.json"));
    const product = readJson(path.join(contentRoot, ref, "product.json"));
    const { languages, defaultLanguage } = seller;
    const parts = [
      [`${ref}/product.json`, reportLocalized(product, languages, defaultLanguage)],
      [`${sellerSlug}/seller.json`, reportLocalized(seller, languages, defaultLanguage)],
    ];
    lines.push(`${ref}: ${coverageLine(mergeCoverage(parts.map(([, r]) => r.coverage)))}`);
    for (const [file, r] of parts) {
      for (const p of r.missingDefault) warnings.push(`${file}: ${p}: no "${defaultLanguage}" text (the default language is required)`);
      for (const [lang, paths] of Object.entries(r.missing)) for (const p of paths) warnings.push(`${file}: ${p}: no "${lang}" text, shows the "${defaultLanguage}" text`);
    }
  }
  return { lines, warnings };
}
