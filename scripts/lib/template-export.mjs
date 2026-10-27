// Exports the TEMPLATE alone (npm run export:template -- --out <folder>): the tracked files of the current commit in a
// fresh git repository with one commit "Template export", no history, no remote, no push.
//
// It refuses to run while the working tree or the index still holds a seller's data (the checks of
// npm run check:template-clean), keeps examples/, tests/fixtures, docs/, the development notes, README.md, DEPLOY.md and
// .github/, and drops content/, .private, .env*, data/leads and node_modules. The snapshot guard then looks for forbidden
// paths, original photos and EXIF; finally every text file is scanned for the client's words (seller names and product
// titles of the real content, .private/client-words.txt) and the private terms (.private/forbidden-terms.txt). A hit in
// code, scripts, themes, tests or examples refuses the export; a hit in docs/, PROJECT.md or PROGRESS.md is a warning.
// Hits are reported as file:line only, never as a word or a line of text.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONTENT_DIR } from "../../src/lib/content-root.ts";
import { clientWords, loadTermsFile, matchingLines, scanContentRoot } from "./content-scan.mjs";
import { checkSnapshot, walk } from "./snapshot-guard.mjs";
import { templateCleanProblems } from "./template-clean.mjs";

/** The export was refused: `problems` lists why (paths and counts only). The folder is removed before this is thrown. */
export class TemplateExportRefused extends Error {
  constructor(problems) {
    super("REFUSED. The template export:\n" + problems.map((p) => "  - " + p).join("\n"));
    this.problems = problems;
  }
}

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const REQUIRED = ["examples", "tests/fixtures"];
const DROP = [DEFAULT_CONTENT_DIR, ".private", "node_modules", "data/leads"];
const BINARY = /\.(png|jpe?g|webp|gif|avif|heic|heif|tiff?|ico|woff2?|ttf|otf|mp4|webm|mov|pdf|zip|gz)$/i;
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
/** Where a hit is only a warning for the owner to review: the development notes. */
const NOTES = (rel) => rel === "PROJECT.md" || rel === "PROGRESS.md" || rel.startsWith("docs/");

/**
 * @param {{ projectRoot: string, dest: string, env?: Record<string, string | undefined>, log?: (line: string) => void }} options
 * @returns {Promise<{ dest: string, commit: string, files: { rel: string, bytes: number }[], bytes: number, warnings: string[] }>}
 */
export async function exportTemplate({ projectRoot, dest, env = process.env, log = () => {} }) {
  if (dest === projectRoot || dest.startsWith(projectRoot + path.sep)) throw new Error("The export folder must be outside this repository.");
  if (fs.existsSync(dest) && (!fs.statSync(dest).isDirectory() || fs.readdirSync(dest).length > 0)) {
    throw new Error(`${dest} already exists and is not empty. Pass the path of a new folder.`);
  }

  log("1. checking that the template holds no seller data (check:template-clean) ...");
  const dirty = templateCleanProblems(projectRoot);
  if (dirty.length) {
    throw new TemplateExportRefused([...dirty.map((p) => `${p.where}: ${p.folder} (seller data)`), "move the content out first: docs/MOVE-CONTENT.md"]);
  }

  const head = git(projectRoot, "rev-parse", "--short", "HEAD");
  const uncommitted = git(projectRoot, "status", "--porcelain", "--untracked-files=no");
  log(`2. exporting the tracked files of commit ${head}${uncommitted ? " (WARNING: uncommitted changes are NOT included)" : ""} ...`);
  fs.mkdirSync(dest, { recursive: true });
  const refuse = (problems) => {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new TemplateExportRefused(problems);
  };
  const tar = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: projectRoot, maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", dest], { input: tar });
  for (const p of DROP) fs.rmSync(path.join(dest, p), { recursive: true, force: true });
  for (const f of fs.readdirSync(dest)) if (f.startsWith(".env") && f !== ".env.example") fs.rmSync(path.join(dest, f), { force: true });
  const missing = REQUIRED.filter((p) => !fs.existsSync(path.join(dest, p)));
  if (missing.length) refuse(missing.map((p) => `${p}: tracked template folder missing (the tests need it)`));

  log("3. checking the tree (forbidden paths, original photos, EXIF) ...");
  const problems = await checkSnapshot(dest);
  if (problems.length) refuse(problems);

  log("4. scanning for the client's words and the private terms ...");
  let contentRoot = null;
  try {
    contentRoot = scanContentRoot({ projectRoot, env });
  } catch {
    contentRoot = null; // an explicit CONTENT_DIR that cannot be read gives no words; the private lists still apply
  }
  const words = clientWords({ projectRoot, contentRoot }).terms;
  const forbidden = loadTermsFile(path.join(projectRoot, ".private", "forbidden-terms.txt")).terms;
  const terms = [...new Set([...words, ...forbidden])];
  const refusing = [];
  const warnings = [];
  for (const f of walk(dest)) {
    if (BINARY.test(f.rel) || f.bytes > MAX_SCAN_BYTES) continue;
    let text;
    try {
      text = fs.readFileSync(f.full, "utf8");
    } catch {
      continue;
    }
    for (const line of matchingLines(text, terms)) (NOTES(f.rel) ? warnings : refusing).push(`${f.rel}:${line}`);
  }
  if (refusing.length) refuse(refusing.map((h) => `${h}: contains a client word or a private term`));
  for (const w of warnings) log(`   WARNING (review): ${w} contains a client word or a private term`);

  git(dest, "init", "-q", "-b", "main");
  git(dest, "add", "-A");
  const tracked = git(dest, "ls-files").split("\n").filter(Boolean);
  const files = walk(dest).filter((f) => !f.rel.startsWith(".git/"));
  const untracked = files.filter((f) => !tracked.includes(f.rel));
  if (untracked.length) refuse(untracked.map((f) => `${f.rel}: not tracked in the export (check .gitignore)`));

  log(`5. files in the export (${tracked.length}):`);
  let total = 0;
  for (const f of files) {
    total += f.bytes;
    log(`   ${String(f.bytes).padStart(9)}  ${f.rel}`);
  }
  log(`   total: ${tracked.length} files, ${(total / 1048576).toFixed(2)} MB (${total} bytes)`);

  git(dest, "-c", "user.name=template-export", "-c", "user.email=template-export@invalid", "commit", "-q", "-m", "Template export");
  return { dest, commit: git(dest, "rev-parse", "--short", "HEAD"), files: files.map(({ rel, bytes }) => ({ rel, bytes })), bytes: total, warnings };
}
