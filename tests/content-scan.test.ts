import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientWordHits, clientWords, contentScanFiles, loadTermsFile, matchingLines, productFolders, readFiles, scanContentRoot } from "../scripts/lib/content-scan.mjs";
import { CLAIM_PHRASES, claimHits, VAT_PHRASES } from "../scripts/lib/forbidden-claims.mjs";
import { listProducts } from "../src/lib/content-root";
import { languageReport } from "../scripts/lib/language-report.mjs";

const root = process.cwd();

/** CONTENT_DIR (must hold a product), else ./content when it has one, else null: a bare template clone with no real content. */
const content = scanContentRoot({ projectRoot: root });

/** Words that must never appear in the content of a real product or in the docs (statements that are not confirmed). */
const FORBIDDEN = ["unfallfrei", "accident-free", "Garantie bis", "Mindestpreis", "minimum price", "Auflösungswert"];

const listed = contentScanFiles({ projectRoot: root, contentRoot: content });
const { texts, unread } = readFiles(listed);
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

/** The sensitive strings live only in the git-ignored .private/forbidden-terms.txt. */
const privateTerms = loadTermsFile(path.join(root, ".private", "forbidden-terms.txt"));

/** Product folders that the scan must cover: the content root's (examples/ excluded), or the fake samples with no real content. */
const productDirs = content
  ? productFolders(content, root)
  : [path.join(root, "examples"), path.join(root, "tests", "fixtures", "content")].flatMap((r) => listProducts(r).map((ref) => path.join(r, ref)));

describe("content scan", () => {
  it("prints the translation coverage per product; a missing translation is a warning, never a failure", () => {
    const report = languageReport(content ?? path.join(root, "examples"));
    expect(report.lines.length).toBeGreaterThan(0);
    for (const line of report.lines) expect(line).toMatch(/: (de|en) \d+% \(\d+\/\d+\)/);
    console.info(["translation coverage:", ...report.lines.map((l) => "  " + l), ...report.warnings.map((w) => "  WARNING " + w)].join("\n"));
  });

  it("finds at least one product folder: the content root's (examples/ excluded), or the fake samples when there is no real content", () => {
    expect(productDirs.length, `no product.json to scan (content root: ${content ?? "none"})`).toBeGreaterThan(0);
    for (const dir of productDirs) expect(listed.map(rel), dir).toContain(rel(path.join(dir, "product.json")));
    for (const dir of productDirs) expect(listed.map(rel), dir).toContain(rel(path.join(path.dirname(dir), "seller.json")));
    if (content) for (const f of listed) expect(f.startsWith(path.join(root, "examples") + path.sep), rel(f)).toBe(false);
  });

  it("lists the docs folder and every markdown file at the root (a snapshot has fewer of them)", () => {
    const names = listed.map(rel);
    const present = [...fs.readdirSync(root).filter((f) => f.endsWith(".md")), ...(fs.existsSync(path.join(root, "docs")) ? fs.readdirSync(path.join(root, "docs")).map((f) => `docs/${f}`) : [])];
    expect(present.length).toBeGreaterThan(0);
    for (const f of present) expect(names, f).toContain(f);
  });

  it("reads every file it listed", () => {
    expect(unread.map(rel), "listed but not read").toEqual([]);
    expect(texts.size).toBe(listed.length);
  });

  it("finds none of the forbidden words (case-insensitive)", () => {
    const hits: string[] = [];
    for (const [file, text] of texts) {
      const lines = matchingLines(text, FORBIDDEN);
      for (const line of lines) hits.push(`${rel(file)}:${line}`);
    }
    expect(hits.length === 0, `a forbidden word was found at: ${hits.join(", ")} (the word itself is never printed)`).toBe(true);
  });

  it("finds none of the private terms (only file and line are ever reported, never a term)", () => {
    // counts only: how many private terms were used and how many entries were too short
    console.info(`private terms: ${privateTerms.terms.length} used, ${privateTerms.skipped} skipped (shorter than 4 characters)`);
    const hits: string[] = [];
    for (const [file, text] of texts) for (const line of matchingLines(text, privateTerms.terms)) hits.push(`${rel(file)}:${line}`);
    expect(hits.length === 0, `a private term was found at: ${hits.join(", ")} (the term itself is never printed)`).toBe(true);
  });

  it("states no VAT claim in any product.json or seller.json (all languages)", () => {
    const hits = claimHits({ projectRoot: root, contentRoot: content }, VAT_PHRASES);
    expect(hits.length === 0, `a VAT statement was found at: ${hits.join(", ")} (the phrase itself is never printed)`).toBe(true);
  });

  it("states no warranty, accident, owner or 'new' claim in any product.json or seller.json (all languages)", () => {
    const hits = claimHits({ projectRoot: root, contentRoot: content }, CLAIM_PHRASES);
    expect(hits.length === 0, `a warranty or history claim was found at: ${hits.join(", ")} (the phrase itself is never printed)`).toBe(true);
  });

  it("keeps the client's words out of the template (src, scripts, themes, tests, root docs)", () => {
    // the words come from the content itself (seller name, product titles) and from .private/client-words.txt
    const { terms, skipped } = clientWords({ projectRoot: root, contentRoot: content });
    console.info(`client words: ${terms.length} used, ${skipped} skipped (shorter than 4 characters)`); // counts only
    if (content) expect(terms.length, "no client words derived from the content").toBeGreaterThan(0);
    const hits = clientWordHits({ projectRoot: root, contentRoot: content });
    expect(hits.length === 0, `a client word was found at: ${hits.join(", ")} (the word itself is never printed)`).toBe(true);
  });

  it(".private is git-ignored, so the private lists can never be committed", () => {
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toMatch(/^\.private\/?$/m);
  });
});
