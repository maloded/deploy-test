// Claims that must not appear in the texts of a product.json or seller.json (all languages) until the client has
// confirmed them in writing: tax statements (VAT) and warranty or history claims (accidents, owners, "new").
// They are NOT scanned in PROJECT.md, docs or the UI strings. The scan reports only the relative path and the line
// number, never a phrase. Entries and texts are compared after normalizeForScan (case, no-break spaces, quotes, dashes).
//
// To remove a phrase on purpose after the client confirmed the claim in writing: delete that entry from the list
// below in its own commit, and name the written confirmation in the commit message. Nothing else turns the scan off.
import path from "node:path";
import { claimFiles, matchingLines, readFiles } from "./content-scan.mjs";

/** B. VAT statements. */
export const VAT_PHRASES = [
  "nicht ausweisbar",
  "ohne MwSt",
  "ohne Mehrwertsteuer",
  "ohne USt",
  "zzgl. MwSt",
  "inkl. MwSt",
  "inklusive MwSt",
  "inkl. USt",
  "steuerfrei",
  "without VAT",
  "excl. VAT",
  "incl. VAT",
  "including VAT",
  "VAT-free",
  "tax-free",
  "VAT included",
  "VAT not",
];

/** C. Warranty and history claims. */
export const CLAIM_PHRASES = [
  "Garantie",
  "Anschlussgarantie",
  "Werksgarantie",
  "Herstellergarantie",
  "warranty",
  "guarantee",
  "unfallfrei",
  "keine Unfälle",
  "kein Unfall",
  "ohne Unfall",
  "no accidents",
  "accident-free",
  "Erstbesitz",
  "one owner",
  "Neuwagen",
  "neuwertig",
  "wie neu",
  "like new",
];

/** A JSON file's text with its string escapes ( , \t, \", ...) decoded, so an escaped space or quote still matches. Line numbers stay the same. */
export function decodeJsonEscapes(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[tnrfb]/g, " ")
    .replace(/\\(["\\/])/g, "$1");
}

/**
 * Where a phrase of the given list appears in the product.json and seller.json files, as "relative/path:line".
 * @param {{ projectRoot: string, contentRoot: string | null }} options
 * @param {string[]} phrases
 * @returns {string[]}
 */
export function claimHits({ projectRoot, contentRoot }, phrases) {
  const { texts } = readFiles(claimFiles({ projectRoot, contentRoot }));
  const hits = [];
  for (const [file, text] of texts) {
    const rel = path.relative(projectRoot, file).split(path.sep).join("/");
    for (const line of matchingLines(decodeJsonEscapes(text), phrases)) hits.push(`${rel}:${line}`);
  }
  return hits;
}
