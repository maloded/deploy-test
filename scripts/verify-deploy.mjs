// npm run verify:deploy -- <url> [--product <seller>/<product>] [--auth user:password] [--expect-template <hash>]
// Prints PASS or FAIL with a short reason for every check; exit code 1 on any FAIL. See scripts/lib/verify-deploy.mjs.
// The expected product title, seller name and languages are read from the LOCAL content root (CONTENT_DIR, also from .env.local).
import fs from "node:fs";
import path from "node:path";
import { contentProduct, contentRoot, splitRef } from "../src/lib/content-root.ts";
import { verifyDeploy } from "./lib/verify-deploy.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = args.find((a, i) => !a.startsWith("--") && !["--product", "--auth", "--expect-template"].includes(args[i - 1]));
if (!url || !/^https?:\/\//i.test(url)) {
  console.error("Usage: npm run verify:deploy -- <url> [--product <seller>/<product>] [--auth user:password] [--expect-template <hash>]");
  process.exit(1);
}

/** The title in the default language, the seller's displayName, languages and the title per language from the local content root. */
function localExpectation() {
  const root = contentRoot();
  const ref = opt("--product") ?? contentProduct(process.env, root);
  const { seller, product } = splitRef(ref);
  const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const sellerJson = readJson(path.join(root, seller, "seller.json"));
  const productJson = readJson(path.join(root, seller, product, "product.json"));
  const title = productJson.title?.[sellerJson.defaultLanguage] ?? productJson.title?.en;
  if (!title || !sellerJson.displayName) throw new Error(`${ref} has no title in "${sellerJson.defaultLanguage}" or the seller has no displayName`);
  const titles = Object.fromEntries(sellerJson.languages.map((l) => [l, productJson.title?.[l] ?? title]));
  return { title, displayName: sellerJson.displayName, languages: sellerJson.languages, defaultLanguage: sellerJson.defaultLanguage, titles };
}

let expected = null;
let expectedProblem;
try {
  expected = localExpectation();
} catch (e) {
  expectedProblem = `cannot read the local product: ${e.message.split("\n")[0]}`;
}

const results = await verifyDeploy({ url, expected, expectedProblem, auth: opt("--auth"), expectTemplate: opt("--expect-template") });
for (const r of results) {
  const tag = !r.ok ? "FAIL" : r.level === "warn" ? "WARN" : r.level === "info" ? "INFO" : "PASS";
  console.log(`${tag}  ${r.name}${(r.ok && !r.level) || !r.reason ? "" : `: ${r.reason}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
