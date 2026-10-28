// Builds a TEMPORARY demo repository for ONE product (npm run snapshot -- --product <seller>/<product> --out <folder>),
// without this repository's history.
//
// A whitelist: the snapshot holds
//   1. the tracked template files of the current commit (git archive HEAD), minus any content/ folder they carry and
//      the development notes (PROJECT.md, PROGRESS.md, docs/), which stay in the working repository; README.md and
//      DEPLOY.md are kept; .github/ is dropped too (the host builds the deployment repository, and the workflow tests
//      the examples, not the product; export:template keeps it),
//   2. <content root>/<seller>/<product> (everything in it except the originals folder media/; media-web is the
//      processed export) and the files of <content root>/<seller> (seller.json), but no other product of the seller,
//   3. examples/ and tests/fixtures (fake data the tests need; they are tracked template files).
// Nothing else under the content root is listed, read or copied. The guard then refuses .private, .env*, data/leads,
// node_modules, original photos and any image that still has EXIF. It never adds a remote and never pushes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONTENT_DIR, splitRef } from "../../src/lib/content-root.ts";
import { exportMediaWeb } from "./export-media-web.mjs";
import { checkSnapshot, walk } from "./snapshot-guard.mjs";
import { buildVersionInfo } from "./version-info.mjs";

/** The snapshot was refused: `problems` lists why. The folder is removed before this is thrown. */
export class SnapshotRefused extends Error {
  constructor(problems) {
    super("REFUSED. The snapshot would contain:\n" + problems.map((p) => "  - " + p).join("\n"));
    this.problems = problems;
  }
}

const REF = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
/** Written into every snapshot; it changes with each build (its time), so the change counters leave it out. */
export const VERSION_FILE = "version.json";
const REQUIRED_TEMPLATE = ["examples", "tests/fixtures"];
const DEV_NOTES = ["PROJECT.md", "PROGRESS.md", "docs", ".github"];
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Checks the product reference and that its folders exist; returns the pieces. Throws a message, never a stack of paths. */
function checkProduct(ref, contentRoot, projectRoot, dest) {
  if (!ref || !REF.test(ref)) throw new Error("Pass --product <seller>/<product> (lowercase letters, digits and dashes): the snapshot holds exactly one product.");
  const { seller, product } = splitRef(ref);
  const sellerDir = path.join(contentRoot, seller);
  if (!fs.existsSync(path.join(sellerDir, product, "product.json"))) throw new Error(`No product "${ref}" in ${contentRoot} (no ${ref}/product.json).`);
  if (!fs.existsSync(path.join(sellerDir, "seller.json"))) throw new Error(`No seller.json for "${seller}" in ${contentRoot}.`);
  if (dest === projectRoot || dest.startsWith(projectRoot + path.sep)) throw new Error("The snapshot folder must be outside this repository.");
}

/**
 * Builds the snapshot FILES (no git) in `dest`: steps 1-4. On a refusal `dest` is removed and SnapshotRefused is thrown.
 * @returns {Promise<void>}
 */
async function buildTree({ projectRoot, contentRoot, ref, dest, log }) {
  const { seller, product } = splitRef(ref);
  const sellerDir = path.join(contentRoot, seller);
  const productDir = path.join(sellerDir, product);
  log(`1. exporting the web copies of ${ref} (only files used by product.json) ...`);
  await exportMediaWeb({ contentDir: contentRoot, products: [ref], log: (l) => log("   " + l) });

  const head = git(projectRoot, "rev-parse", "--short", "HEAD");
  const dirty = git(projectRoot, "status", "--porcelain", "--untracked-files=no");
  log(`2. exporting the tracked template files of commit ${head}${dirty ? " (WARNING: uncommitted changes are NOT included)" : ""} ...`);
  fs.mkdirSync(dest, { recursive: true });
  const tar = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: projectRoot, maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", dest], { input: tar });
  fs.rmSync(path.join(dest, DEFAULT_CONTENT_DIR), { recursive: true, force: true }); // the template carries no content; only the chosen product is added
  for (const note of DEV_NOTES) fs.rmSync(path.join(dest, note), { recursive: true, force: true });
  const missing = REQUIRED_TEMPLATE.filter((p) => !fs.existsSync(path.join(dest, p)));
  const refuse = (problems) => {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new SnapshotRefused(problems);
  };
  if (missing.length) refuse(missing.map((p) => `${p}: tracked template folder missing (the tests need it)`));

  log(`3. adding only ${ref} and its seller's own files from the content root (without the originals folder media/) ...`);
  const sellerOut = path.join(dest, DEFAULT_CONTENT_DIR, seller); // the snapshot always keeps its content at ./content
  fs.mkdirSync(sellerOut, { recursive: true });
  for (const entry of fs.readdirSync(sellerDir, { withFileTypes: true })) {
    // the seller's files (seller.json, ...) but no folder: the seller's other products must not travel
    if (entry.isFile()) fs.copyFileSync(path.join(sellerDir, entry.name), path.join(sellerOut, entry.name));
  }
  fs.cpSync(productDir, path.join(sellerOut, product), {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(productDir, src);
      if (rel === "media") return false; // originals are never copied
      return !fs.lstatSync(src).isSymbolicLink();
    },
  });

  log("4. checking the tree ...");
  const problems = await checkSnapshot(dest);
  if (problems.length) refuse(problems);

  // the build's own description (version, template and content commit, time): hashes, numbers and a date only
  fs.writeFileSync(path.join(dest, VERSION_FILE), JSON.stringify(buildVersionInfo({ projectRoot, contentRoot }), null, 2) + "\n");
}

/**
 * @param {{ projectRoot: string, contentRoot: string, product: string, dest: string, replace?: boolean, trailer?: string, log?: (line: string) => void }} options product: "<seller>/<product>"
 * @returns {Promise<{ dest: string, commit: string, files: { rel: string, bytes: number }[], bytes: number }>}
 */
export async function createSnapshot({ projectRoot, contentRoot, product: ref, dest, replace = false, trailer, log = () => {} }) {
  checkProduct(ref, contentRoot, projectRoot, dest);

  if (fs.existsSync(dest)) {
    const isOurs = fs.existsSync(path.join(dest, ".git")) && (() => {
      try {
        return git(dest, "log", "-1", "--format=%s") === "Demo snapshot";
      } catch {
        return false;
      }
    })();
    if (!replace || !isOurs) {
      throw new Error(`${dest} already exists. Pass --replace to rebuild it (only allowed for a folder whose last commit is "Demo snapshot").`);
    }
    fs.rmSync(dest, { recursive: true, force: true });
  }

  await buildTree({ projectRoot, contentRoot, ref, dest, log });
  const refuse = (problems) => {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new SnapshotRefused(problems);
  };

  git(dest, "init", "-q", "-b", "main");
  git(dest, "add", "-A");
  git(dest, "add", "-f", "-A", DEFAULT_CONTENT_DIR); // the template ignores content photos and media-web; in the snapshot they are the point
  const tracked = git(dest, "ls-files").split("\n").filter(Boolean);
  const files = walk(dest).filter((f) => !f.rel.startsWith(".git/"));
  const untracked = files.filter((f) => !tracked.includes(f.rel));
  if (untracked.length) refuse(untracked.map((f) => `${f.rel}: not tracked in the snapshot (check .gitignore)`));

  log(`5. files in the snapshot (${tracked.length}):`);
  let total = 0;
  for (const f of files) {
    total += f.bytes;
    log(`   ${String(f.bytes).padStart(9)}  ${f.rel}`);
  }
  log(`   total: ${tracked.length} files, ${(total / 1048576).toFixed(2)} MB (${total} bytes)`);

  git(dest, "-c", "user.name=snapshot", "-c", "user.email=snapshot@invalid", "commit", "-q", "-m", trailer ? `Demo snapshot\n\n${trailer}\n` : "Demo snapshot\n");
  return { dest, commit: git(dest, "rev-parse", "--short", "HEAD"), files: files.map(({ rel, bytes }) => ({ rel, bytes })), bytes: total };
}

// ---- update ---------------------------------------------------------------------------------------------------------

/** The subject of every commit of a deploy repository we made: "Demo snapshot" or "Update: ...". */
const OURS = /^(Demo snapshot|Update: .+)$/;

/** Why `dest` is not an existing deploy repository this tool may update, or null. */
export function foreignHistoryReason(dest) {
  if (!fs.existsSync(path.join(dest, ".git"))) return `${dest} is not a git repository (use --out with a new folder to create a snapshot first).`;
  let subjects;
  try {
    subjects = git(dest, "log", "--format=%s").split("\n").filter(Boolean);
  } catch {
    return `${dest} has no commits.`;
  }
  const foreign = subjects.filter((s) => !OURS.test(s));
  if (foreign.length) return `${dest} has ${foreign.length} commit(s) that are not "Demo snapshot" or "Update: ..." (foreign history); refusing to touch it.`;
  if (git(dest, "rev-list", "--merges", "HEAD")) return `${dest} has merge commits; its history is not linear.`;
  if (git(dest, "status", "--porcelain")) return `${dest} has uncommitted changes; commit or discard them first.`;
  return null;
}

/** "Update: a, b, c and 2 more" from the changed paths (kept short for a commit subject). */
export function updateSummary(paths) {
  const shown = paths.slice(0, 3).map((p) => (p.length > 40 ? "..." + p.slice(-37) : p));
  return `Update: ${shown.join(", ")}${paths.length > 3 ? ` and ${paths.length - 3} more` : ""}`;
}

/**
 * Updates an existing deploy repository (made by this tool) with a new snapshot of one product: the working tree is
 * replaced (everything except .git) and ONE new commit "Update: <changed paths>" is put on top of the existing history.
 * It never pushes, never rewrites history and prints the push command for the person to run.
 * @param {{ projectRoot: string, contentRoot: string, product: string, dest: string, log?: (line: string) => void }} options
 * @returns {Promise<{ dest: string, commit: string | null, changed: string[], templateChanged: string[], branch: string, pushCommand: string }>}
 */
export async function updateSnapshot({ projectRoot, contentRoot, product: ref, dest, log = () => {} }) {
  checkProduct(ref, contentRoot, projectRoot, dest);
  if (!fs.existsSync(dest)) throw new Error(`${dest} does not exist. --update needs an existing deploy repository; create it first with --out <new folder>.`);
  const reason = foreignHistoryReason(dest);
  if (reason) throw new Error(reason);

  const staging = fs.mkdtempSync(path.join(path.dirname(dest), ".snapshot-update-")); // next to the deploy folder, never inside this repository
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    await buildTree({ projectRoot, contentRoot, ref, dest: staging, log });
    log("6. replacing the working tree of the deploy repository (everything except .git) ...");
    for (const entry of fs.readdirSync(dest)) if (entry !== ".git") fs.rmSync(path.join(dest, entry), { recursive: true, force: true });
    for (const entry of fs.readdirSync(staging)) fs.renameSync(path.join(staging, entry), path.join(dest, entry));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  git(dest, "add", "-A");
  git(dest, "add", "-f", "-A", DEFAULT_CONTENT_DIR);
  const staged = git(dest, "diff", "--cached", "--name-only", "HEAD").split("\n").filter(Boolean);
  // version.json differs in every build (its time): it is expected, goes along with a real change, and is not counted
  const changed = staged.filter((p) => p !== VERSION_FILE);
  const templateChanged = changed.filter((p) => !p.startsWith(DEFAULT_CONTENT_DIR + "/"));
  const branch = git(dest, "rev-parse", "--abbrev-ref", "HEAD");
  const pushCommand = `git -C ${dest} push origin ${branch}`;
  let commit = null;
  if (changed.length) {
    git(dest, "-c", "user.name=snapshot", "-c", "user.email=snapshot@invalid", "commit", "-q", "-m", updateSummary(changed));
    commit = git(dest, "rev-parse", "--short", "HEAD");
  } else if (staged.length) {
    git(dest, "reset", "-q", "--hard", "HEAD"); // only the new version.json: no commit, and the deploy folder stays clean
  }
  return { dest, commit, changed, templateChanged, branch, pushCommand };
}
