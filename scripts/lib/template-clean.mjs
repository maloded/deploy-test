import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONTENT_DIR } from "../../src/lib/content-root.ts";

/** Folders that may hold a seller on purpose: the fake examples and the test fixtures. */
export const ALLOWED_SELLER_PARENTS = ["examples", "tests/fixtures"];
const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".test-tmp", ".playwright-mcp"]);

const posix = (p) => p.split(path.sep).join("/");
const allowed = (rel) => ALLOWED_SELLER_PARENTS.some((a) => rel === a || rel.startsWith(`${a}/`));

/** Every seller.json in the working tree (ignored files included), as a project-relative path. */
export function workingTreeSellerFiles(projectRoot) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.name === "seller.json") found.push(posix(path.relative(projectRoot, path.join(dir, entry.name))));
    }
  };
  walk(projectRoot);
  return found;
}

/** Every path in the git index that is a seller.json. */
export function indexSellerFiles(projectRoot) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached"], { cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter((p) => p === "seller.json" || p.endsWith("/seller.json"));
}

/** Seller folders of the default content root that hold no seller.json yet (e.g. only photos): they still are a seller's data. */
function bareContentFolders(projectRoot) {
  const root = path.join(projectRoot, DEFAULT_CONTENT_DIR);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${DEFAULT_CONTENT_DIR}/${e.name}`);
}

/**
 * The seller folders that must not be in the template: any folder with a seller.json (in the working tree or the git
 * index) outside examples/ and tests/fixtures, and any folder directly inside ./content.
 * @returns {{ where: "working tree" | "index", folder: string }[]}
 */
export function templateCleanProblems(projectRoot) {
  const problems = [];
  const add = (where, folder) => {
    if (!problems.some((p) => p.where === where && p.folder === folder)) problems.push({ where, folder });
  };
  for (const file of workingTreeSellerFiles(projectRoot)) if (!allowed(file)) add("working tree", posix(path.dirname(file)));
  for (const folder of bareContentFolders(projectRoot)) add("working tree", folder);
  for (const file of indexSellerFiles(projectRoot)) if (!allowed(file)) add("index", posix(path.dirname(file)));
  return problems;
}
