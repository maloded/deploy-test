// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { templateCleanProblems } from "../scripts/lib/template-clean.mjs";

const tmp = path.join(process.cwd(), ".test-tmp", "template-clean");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
/** A throwaway git repository with the given files (relative path -> text). */
function repo(files: Record<string, string>, { commit = false } = {}) {
  const dir = path.join(tmp, `r${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  if (commit) git("add", "-f", "-A");
  return dir;
}

describe("check:template-clean", () => {
  it("is clean with only examples/ and tests/fixtures sellers", () => {
    const dir = repo({ "examples/s/seller.json": "{}", "examples/s/p/product.json": "{}", "tests/fixtures/content/f/seller.json": "{}" }, { commit: true });
    expect(templateCleanProblems(dir)).toEqual([]);
  });

  it("is clean in a bare clone with no content folder", () => {
    expect(templateCleanProblems(repo({ "README.md": "x" }, { commit: true }))).toEqual([]);
  });

  it("finds a seller folder in the working tree, even when git ignores it", () => {
    const dir = repo({ ".gitignore": "content/\n", "content/s/seller.json": "{}" });
    expect(templateCleanProblems(dir)).toEqual([{ where: "working tree", folder: "content/s" }]);
  });

  it("finds a seller folder in the index", () => {
    const dir = repo({ "content/s/seller.json": "{}" }, { commit: true });
    expect(templateCleanProblems(dir)).toEqual([
      { where: "working tree", folder: "content/s" },
      { where: "index", folder: "content/s" },
    ]);
  });

  it("finds a seller folder anywhere outside the allowed folders, and a content folder without seller.json", () => {
    const dir = repo({ "elsewhere/x/seller.json": "{}", "content/only-photos/media/a.txt": "x" });
    const folders = templateCleanProblems(dir).map((p) => p.folder).sort();
    expect(folders).toEqual(["content/only-photos", "elsewhere/x"]);
  });

  it("is not part of npm test, the build, the prebuild or CI", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    for (const name of ["test", "build", "prebuild", "pretest", "postbuild", "dev", "images"]) expect(pkg.scripts[name] ?? "", name).not.toContain("check:template-clean");
    expect(pkg.scripts["check:template-clean"]).toBeDefined();
    const ci = path.join(process.cwd(), ".github");
    if (fs.existsSync(ci)) {
      const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
      for (const f of walk(ci)) expect(fs.readFileSync(f, "utf8"), f).not.toContain("template-clean");
    }
  });
});
