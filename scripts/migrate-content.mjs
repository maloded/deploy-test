// Migrates content from the old layout to the seller layout (self-contained Node, no TypeScript, no template imports):
//
//   old:  <root>/<product>/product.json (+ media/, media-web/)      brand, contact, languages, theme inside every product
//   new:  <root>/<seller>/seller.json
//         <root>/<seller>/<product>/product.json (+ media/, media-web/)
//
// node scripts/migrate-content.mjs --seller <slug> [--root <folder>] [--write]
//
//   --seller  REQUIRED, never guessed: the seller folder name the old products are grouped under.
//   --root    the content root (default: CONTENT_DIR, else ./content).
//   --write   apply. Without it nothing is changed (dry run).
//   --display-name  only when no product has a brand: the seller's displayName (never guessed).
//   --theme   only when the products use different themes: the seller's default; a product with another theme keeps it as its override.
//
// brand, contact, languages and theme move to seller.json, and only when they are identical in every product of the
// batch; otherwise the script stops and names the fields (and products) that differ, without printing any value.
// Everything else in product.json stays byte for byte (only those members are cut out of the text). Product folders
// are MOVED by rename (never copied and deleted); file counts and SHA-256 hashes are verified afterwards.
// Output is counts and names of folders and fields only, never content.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MOVED = ["brand", "contact", "languages", "theme"];
/** The footer line that used to be a UI string; it becomes seller.legalNote so the page keeps showing the same text. */
const FORMER_FOOTER_LEGAL = {
  en: "Information on this page is indicative and does not constitute a binding offer.",
  de: "Die Angaben auf dieser Seite sind unverbindlich und stellen kein verbindliches Angebot dar.",
  ru: "Информация на этой странице носит ориентировочный характер и не является обязательным предложением.",
  uk: "Інформація на цій сторінці є орієнтовною і не є обов’язковою пропозицією.",
};
const LANGUAGE_ORDER = ["en", "de", "ru", "uk"];

// ---- JSON text surgery ---------------------------------------------------------------------------------------------

/** The top-level members of a JSON object text: name, start (of the key), end (just after the value) and whether a comma follows. */
export function topLevelMembers(text) {
  const members = [];
  let depth = 0;
  let i = 0;
  let current = null;
  let expectKey = false;
  const skipString = () => {
    // i is at the opening quote; leaves i just after the closing quote
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      skipString();
      if (depth === 1 && expectKey) {
        current = { name: JSON.parse(text.slice(start, i)), start, end: -1, comma: false };
        expectKey = false;
      }
      continue;
    }
    if (c === "{" || c === "[") {
      depth++;
      if (depth === 1) expectKey = true;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0 && current) {
        current.end = i;
        members.push(current);
        current = null;
      }
    } else if (c === "," && depth === 1 && current) {
      current.end = i;
      current.comma = true;
      members.push(current);
      current = null;
      expectKey = true;
    }
    i++;
  }
  // a member ends where its value ends: trim whitespace before the comma or closing brace
  for (const m of members) while (/\s/.test(text[m.end - 1])) m.end--;
  return members;
}

/** The text without the named top-level members; every other byte is kept. Throws when the result is not the same object minus those keys. */
export function removeMembers(text, names) {
  const members = topLevelMembers(text);
  const gone = new Set(names);
  const cuts = [];
  const lineStart = (i) => text.lastIndexOf("\n", i) + 1;
  for (const m of members) {
    if (!gone.has(m.name)) continue;
    let end = m.end;
    if (m.comma) end = text.indexOf(",", end) + 1;
    const nl = text.indexOf("\n", end);
    if (nl !== -1 && text.slice(end, nl).trim() === "") end = nl + 1;
    cuts.push([lineStart(m.start), end]);
  }
  const kept = members.filter((m) => !gone.has(m.name));
  const last = members[members.length - 1];
  if (last && gone.has(last.name) && kept.length) {
    const before = kept[kept.length - 1];
    if (before.comma) cuts.push([text.indexOf(",", before.end), text.indexOf(",", before.end) + 1]); // the new last member loses its comma
  }
  let out = text;
  for (const [from, to] of cuts.sort((a, b) => b[0] - a[0])) out = out.slice(0, from) + out.slice(to);
  const before = JSON.parse(text);
  const after = JSON.parse(out);
  for (const n of names) delete before[n];
  if (!deepEqual(before, after)) throw new Error("internal check failed: the edited product.json is not the original minus the moved fields");
  return out;
}

// ---- helpers -------------------------------------------------------------------------------------------------------

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Every file under dir as relative path -> sha256 (hash of the bytes), skipping the named relative files. */
function inventory(dir, skip = []) {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const rel = path.relative(dir, full).split(path.sep).join("/");
        if (!skip.includes(rel)) out.set(rel, sha(fs.readFileSync(full)));
      }
    }
  };
  walk(dir);
  return out;
}

function sameInventory(a, b) {
  return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
}

// ---- the migration ---------------------------------------------------------------------------------------------------

/**
 * @param {{ root: string, seller: string, write?: boolean, theme?: string, displayName?: string, log?: (line: string) => void }} options
 * @returns {{ products: string[], files: number, moved: string[], written: boolean }}
 */
export function migrate(options) {
  const { root, seller, write = false, log = () => {} } = options;
  if (!seller || !SLUG.test(seller)) throw new Error("Pass --seller <slug> (lowercase letters, digits and dashes). It is never guessed.");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`The content root does not exist: ${root}`);

  const folders = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const products = folders.filter((n) => fs.existsSync(path.join(root, n, "product.json")) && !fs.existsSync(path.join(root, n, "seller.json")));
  if (products.length === 0) throw new Error(`No old-layout product (<product>/product.json) in ${root}. Nothing to migrate.`);
  if (products.includes(seller)) throw new Error(`A product folder is already named "${seller}"; choose another seller slug.`);
  const sellerDir = path.join(root, seller);
  if (fs.existsSync(sellerDir)) throw new Error(`The seller folder "${seller}" already exists; the script does not merge into it.`);

  // read every product
  const texts = new Map();
  const data = new Map();
  for (const p of products) {
    const text = fs.readFileSync(path.join(root, p, "product.json"), "utf8");
    texts.set(p, text);
    try {
      data.set(p, JSON.parse(text));
    } catch {
      throw new Error(`${p}/product.json is not valid JSON.`);
    }
  }

  // brand, contact and languages must agree across the products (theme may differ: see below)
  const differing = [];
  for (const field of ["brand", "contact", "languages"]) {
    const values = products.map((p) => data.get(p)[field]);
    if (!values.every((v) => deepEqual(v, values[0]))) differing.push(`${field} (differs between: ${products.filter((p, i) => !deepEqual(values[i], values[0])).concat(products[0]).join(", ")})`);
  }
  if (differing.length) throw new Error(`Cannot group these products under one seller: ${differing.join("; ")}. Make them identical first, or migrate them separately.`);
  const first = data.get(products[0]);
  const missing = ["contact", "languages", "theme"].filter((f) => products.some((p) => data.get(p)[f] === undefined));
  if (missing.length) throw new Error(`Missing in the products: ${missing.join(", ")}. The seller needs them; the script does not invent values.`);
  let displayName = first.brand;
  if (displayName === undefined) {
    if (!options.displayName) throw new Error("No product has a brand, and the seller needs a displayName: pass --display-name <text> (it is never guessed).");
    displayName = options.displayName;
  } else if (options.displayName) {
    throw new Error("The products have a brand already; do not pass --display-name.");
  }
  if (typeof displayName !== "string" || !displayName) throw new Error("brand must be a non-empty text (it becomes seller.displayName).");
  // theme: the seller's default. Identical everywhere: it moves. Different: --theme names the default, a product with
  // another theme keeps it as its own override.
  const themes = products.map((p) => data.get(p).theme);
  const sameTheme = themes.every((t) => t === themes[0]);
  if (!sameTheme && !options.theme) throw new Error(`The products use different themes (${products.filter((p, i) => themes[i] !== themes[0]).concat(products[0]).join(", ")}): pass --theme <name> for the seller's default; products with another theme keep it as an override.`);
  const defaultTheme = options.theme ?? themes[0];
  const overrides = products.filter((p) => data.get(p).theme !== defaultTheme);
  if (!first.contact || typeof first.contact.email !== "string" || !first.contact.consentText) throw new Error("contact must hold email and consentText.");
  const extraContact = Object.keys(first.contact).filter((k) => !["email", "consentText"].includes(k));
  if (extraContact.length) throw new Error(`contact has fields the migration does not know: ${extraContact.join(", ")}.`);
  if (!Array.isArray(first.languages) || first.languages.length === 0) throw new Error("languages must be a non-empty list.");

  const legalNote = {};
  for (const lang of LANGUAGE_ORDER) if (lang === "en" || first.languages.includes(lang)) legalNote[lang] = FORMER_FOOTER_LEGAL[lang];
  const sellerJson = {
    schemaVersion: 1,
    displayName,
    legalNote,
    contact: { email: first.contact.email },
    languages: first.languages,
    defaultLanguage: first.languages[0], // the old rule: the first language was the page language
    theme: defaultTheme,
    consentText: first.contact.consentText,
  };
  const sellerText = JSON.stringify(sellerJson, null, 2) + "\n";
  // brand, contact and languages always leave the product; theme only when it is the seller's default
  const newTexts = new Map(products.map((p) => [p, removeMembers(texts.get(p), overrides.includes(p) ? ["brand", "contact", "languages"] : MOVED)]));

  const before = new Map(products.map((p) => [p, inventory(path.join(root, p), ["product.json"])]));
  const fileCount = [...before.values()].reduce((n, m) => n + m.size + 1, 0);
  log(`products: ${products.length} (${products.join(", ")})`);
  log(`files: ${fileCount} (including ${products.length} product.json)`);
  log(`fields moved to seller.json: ${MOVED.join(", ")} (identical in all products; theme overrides kept in ${overrides.length} product(s))`);
  log(`seller.json gets: ${Object.keys(sellerJson).join(", ")} (legalNote carries the former footer line, defaultLanguage is the former first language)`);
  log(`seller folder: ${seller}`);

  if (!write) {
    log("dry run: nothing was changed. Run again with --write to apply.");
    return { products, files: fileCount, moved: MOVED, written: false };
  }

  fs.mkdirSync(sellerDir);
  fs.writeFileSync(path.join(sellerDir, "seller.json"), sellerText, { flag: "wx" });
  for (const p of products) {
    const from = path.join(root, p);
    const to = path.join(sellerDir, p);
    fs.renameSync(from, to); // a rename on the same file system; it throws (EXDEV) instead of copying
    const file = path.join(to, "product.json");
    fs.writeFileSync(file + ".tmp", newTexts.get(p));
    fs.renameSync(file + ".tmp", file);
  }

  // verify: same files, same hashes; product.json is exactly the expected text
  let verified = 0;
  for (const p of products) {
    const after = inventory(path.join(sellerDir, p), ["product.json"]);
    if (!sameInventory(before.get(p), after)) throw new Error(`VERIFY FAILED for ${p}: files or hashes differ after the move.`);
    if (sha(fs.readFileSync(path.join(sellerDir, p, "product.json"), "utf8")) !== sha(newTexts.get(p))) throw new Error(`VERIFY FAILED for ${p}: product.json is not the expected text.`);
    if (fs.existsSync(path.join(root, p))) throw new Error(`VERIFY FAILED for ${p}: the old folder still exists.`);
    verified += after.size + 1;
  }
  log(`moved and verified: ${products.length} product folders, ${verified} files, hashes identical (product.json checked against the expected text)`);
  return { products, files: verified, moved: MOVED, written: true };
}

// ---- command line --------------------------------------------------------------------------------------------------------

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    const root = path.resolve(arg("--root") ?? (process.env.CONTENT_DIR?.trim() || "content"));
    migrate({ root, seller: arg("--seller"), write: args.includes("--write"), theme: arg("--theme"), displayName: arg("--display-name"), log: console.log });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
