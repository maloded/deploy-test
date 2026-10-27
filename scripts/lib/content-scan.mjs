// Helpers for the content scan (tests/content-scan.test.ts). The private term list (.private/forbidden-terms.txt)
// holds sensitive strings, so NOTHING here ever returns, logs or prints a term: matches are reported as file and line.
import fs from "node:fs";
import path from "node:path";
import { contentRoot as checkedContentRoot, DEFAULT_CONTENT_DIR, listProducts, listSellers, resolveContentDir } from "../../src/lib/content-root.ts";

/** Entries shorter than this are skipped (too short to be a meaningful, safe match). */
export const MIN_TERM_LENGTH = 4;

/**
 * Terms from the text of a list file: one per line, trimmed. Empty lines, whitespace-only lines and lines starting
 * with "#" are ignored; entries shorter than MIN_TERM_LENGTH are skipped and only counted.
 * @param {string} text
 * @returns {{ terms: string[], skipped: number }}
 */
export function parseTerms(text) {
  const terms = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.length < MIN_TERM_LENGTH) {
      skipped++;
      continue;
    }
    if (!terms.includes(line)) terms.push(line);
  }
  return { terms, skipped };
}

/** A missing or empty file means "no extra terms". */
export function loadTermsFile(file) {
  if (!fs.existsSync(file)) return { terms: [], skipped: 0 };
  return parseTerms(fs.readFileSync(file, "utf8"));
}

/**
 * Text made comparable: Unicode NFKC (a no-break or narrow space becomes a plain space), lower case, soft hyphens and
 * zero-width characters removed, every run of whitespace one plain space, typographic quotes and dashes plain ones.
 * Both the entries and the scanned text go through this before they are compared.
 * @param {string} text
 */
export function normalizeForScan(text) {
  return text
    .normalize("NFKC")
    .replace(/[­​-‍⁠﻿]/g, "")
    .toLowerCase()
    .replace(/[‘’‚‛ʼ′]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * 1-based line numbers of the lines that contain any of the terms, compared after normalizeForScan on both sides.
 * Only numbers are returned: never the term and never the line.
 * @param {string} text
 * @param {string[]} terms
 * @returns {number[]}
 */
export function matchingLines(text, terms) {
  const wanted = [...new Set(terms.map(normalizeForScan).filter(Boolean))];
  if (wanted.length === 0) return [];
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = normalizeForScan(line);
    if (wanted.some((t) => l.includes(t))) hits.push(i + 1);
  });
  return hits;
}

// ---- which files are scanned -------------------------------------------------------------------------------------

const TEXT_FILE = /\.(json|md|txt|ts|tsx|mjs|css)$/i;
const SKIP_DIRS = new Set(["media", "media-web", "node_modules", ".next", ".git", ".test-tmp", ".private"]);

/**
 * Text files of a folder, recursively (photos, binaries and generated folders are skipped).
 * @param {string} dir
 * @param {{ skip?: string[] }} [options] absolute folders to leave out
 * @returns {string[]}
 */
export function textFiles(dir, { skip = [] } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) || skip.includes(full) ? [] : textFiles(full, { skip });
    return TEXT_FILE.test(e.name) ? [full] : [];
  });
}

const rootMarkdown = (projectRoot) => fs.readdirSync(projectRoot).filter((f) => f.endsWith(".md")).sort().map((f) => path.join(projectRoot, f));

const underExamples = (dir, projectRoot) => (dir + path.sep).startsWith(path.join(projectRoot, "examples") + path.sep);

/**
 * Every product folder (<seller>/<product>, holding a product.json) of the content root. Only examples/ is excluded,
 * by path, and only when the content root is not examples/ itself.
 * @param {string} contentRoot
 * @param {string} projectRoot
 * @returns {string[]} absolute folders
 */
export function productFolders(contentRoot, projectRoot) {
  return listProducts(contentRoot)
    .map((ref) => path.join(contentRoot, ref))
    .filter((dir) => !underExamples(dir, projectRoot));
}

/** The seller folders of the content root (each holds seller.json and its products), examples/ excluded the same way. */
export function sellerFolders(contentRoot, projectRoot) {
  return listSellers(contentRoot)
    .map((name) => path.join(contentRoot, name))
    .filter((dir) => !underExamples(dir, projectRoot));
}

/**
 * The content root to scan. An explicit CONTENT_DIR must exist and hold a product (anything else is an error). Without
 * it, ./content is used when it holds a product; a bare template clone has none, which is fine: null.
 * @param {{ projectRoot: string, env?: Record<string, string | undefined> }} options
 * @returns {string | null}
 */
export function scanContentRoot({ projectRoot, env = process.env }) {
  const dir = env.CONTENT_DIR?.trim() ? checkedContentRoot(env, projectRoot) : resolveContentDir(env, projectRoot);
  if (underExamples(dir, projectRoot)) return null; // CONTENT_DIR=examples is the template's own fake data, not a client's
  return env.CONTENT_DIR?.trim() || listProducts(dir).length > 0 ? dir : null;
}

/** The fake sellers of the template (examples/ and the test fixtures), scanned when there is no real content. */
export function sampleFolders(projectRoot) {
  return [path.join(projectRoot, "examples"), path.join(projectRoot, "tests", "fixtures", DEFAULT_CONTENT_DIR)].flatMap((root) => listSellers(root).map((s) => path.join(root, s)));
}

/**
 * Files for the content scan (forbidden statements and private terms): every seller folder of the content root (its
 * seller.json and all its products; or, with no real content, the fake samples), the docs folder and the markdown
 * files at the project root.
 * @param {{ projectRoot: string, contentRoot: string | null }} options
 */
export function contentScanFiles({ projectRoot, contentRoot }) {
  const folders = contentRoot ? sellerFolders(contentRoot, projectRoot) : sampleFolders(projectRoot);
  return [...folders.flatMap((d) => textFiles(d)), ...textFiles(path.join(projectRoot, "docs")), ...rootMarkdown(projectRoot)];
}

/** The seller.json and product.json files of the content root (or of the fake samples): the texts the claims scan reads. */
export function claimFiles({ projectRoot, contentRoot }) {
  const folders = contentRoot ? sellerFolders(contentRoot, projectRoot) : sampleFolders(projectRoot);
  return folders.flatMap((d) => textFiles(d)).filter((f) => /[\\/](seller|product)\.json$/.test(f));
}

/** Files that must not contain the client's own words: the template (code, scripts, themes, tests but not fixtures) and the root docs. */
export function clientWordFiles({ projectRoot }) {
  const dirs = ["src", "scripts", path.join("public", "themes"), "tests"].map((d) => path.join(projectRoot, d));
  const fixtures = path.join(projectRoot, "tests", "fixtures");
  return [...dirs.flatMap((d) => textFiles(d, { skip: [fixtures] })), ...rootMarkdown(projectRoot)];
}

/**
 * Reads every listed file. A path that could not be read comes back in `unread`, so a test can fail when the list
 * and the reading disagree.
 * @param {string[]} files
 * @returns {{ texts: Map<string, string>, unread: string[] }}
 */
export function readFiles(files) {
  const texts = new Map();
  const unread = [];
  for (const file of files) {
    try {
      texts.set(file, fs.readFileSync(file, "utf8"));
    } catch {
      unread.push(file);
    }
  }
  return { texts, unread };
}

/** The text with every "## ..." section whose heading matches blanked out (line numbers stay the same). */
export function blankSections(text, headingPattern) {
  let blank = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) blank = headingPattern.test(heading[1]);
      return blank ? "" : line;
    })
    .join("\n");
}

// ---- client words -------------------------------------------------------------------------------------------------

/**
 * The client's own words, taken from the content itself: every seller's displayName (seller.json) and every product
 * title (all languages), whole strings. Plus the entries of .private/client-words.txt (same rules as the forbidden terms).
 * @returns {{ terms: string[], skipped: number }}
 */
export function clientWords({ projectRoot, contentRoot }) {
  const found = new Set();
  const add = (v) => typeof v === "string" && v.trim() && found.add(v.trim());
  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  for (const dir of contentRoot ? productFolders(contentRoot, projectRoot) : []) {
    const product = readJson(path.join(dir, "product.json"));
    for (const v of Object.values(product?.title ?? {})) add(v);
  }
  for (const dir of contentRoot ? sellerFolders(contentRoot, projectRoot) : []) {
    const file = path.join(dir, "seller.json");
    add((fs.existsSync(file) ? readJson(file) : null)?.displayName);
  }
  const own = parseTerms([...found].join("\n"));
  const extra = loadTermsFile(path.join(projectRoot, ".private", "client-words.txt"));
  return { terms: [...new Set([...own.terms, ...extra.terms])], skipped: own.skipped + extra.skipped };
}

/**
 * Where the client's words appear in the template, as "relative/path:line". Never returns a word or a line of text.
 * PROJECT.md sections about decisions may name the first client.
 */
export function clientWordHits({ projectRoot, contentRoot }) {
  const { terms } = clientWords({ projectRoot, contentRoot });
  const { texts } = readFiles(clientWordFiles({ projectRoot }));
  const hits = [];
  for (const [file, text] of texts) {
    const rel = path.relative(projectRoot, file).split(path.sep).join("/");
    const scanned = rel === "PROJECT.md" ? blankSections(text, /decisions/i) : text;
    for (const line of matchingLines(scanned, terms)) hits.push(`${rel}:${line}`);
  }
  return hits;
}
