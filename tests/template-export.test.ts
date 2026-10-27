// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { exportTemplate, TemplateExportRefused } from "../scripts/lib/template-export.mjs";

const tmp = path.join(process.cwd(), ".test-tmp", "template-export");
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-export-"));
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let n = 0;
/** A temporary project (a git repository with an old commit and a current one) that looks like the template. */
function project(extra: Record<string, string> = {}, { untracked = {} as Record<string, string> } = {}) {
  const dir = path.join(tmp, `proj${n++}`);
  const write = (files: Record<string, string>) => {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
  };
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  write({ "old-history.txt": "an earlier commit" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "an earlier commit");
  fs.rmSync(path.join(dir, "old-history.txt"));
  write({
    "README.md": "# template\n",
    "DEPLOY.md": "# deploy\n",
    "PROJECT.md": "# project\n",
    "PROGRESS.md": "# progress\n",
    "docs/MOVE.md": "# move\n",
    "src/code.ts": "export const a = 1;\n",
    ".github/workflows/ci.yml": "name: ci\n",
    ".env.example": "CONTENT_DIR=\n",
    "examples/ex-seller/seller.json": "{}\n",
    "examples/ex-seller/ex-product/product.json": "{}\n",
    "tests/fixtures/content/fx-seller/seller.json": "{}\n",
    ...extra,
  });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "current");
  write(untracked); // present in the working tree only
  return dir;
}
const dest = () => path.join(outside, `out${n++}`);
const run = (dir: string, d: string, env: Record<string, string | undefined> = {}) => exportTemplate({ projectRoot: dir, dest: d, env: { ...env } });
const listing = (d: string) => execFileSync("git", ["ls-files"], { cwd: d, encoding: "utf8" }).split("\n").filter(Boolean);

describe("export:template", () => {
  it("exports the tracked files into a fresh repository: one commit, no history, no remote", async () => {
    const d = dest();
    const r = await run(project(), d);
    expect(git(d, "log", "--format=%s")).toBe("Template export");
    expect(git(d, "remote")).toBe("");
    expect(r.files.length).toBeGreaterThan(8);
    expect(listing(d)).toEqual(expect.arrayContaining(["README.md", "DEPLOY.md", "PROJECT.md", "PROGRESS.md", "docs/MOVE.md", "src/code.ts", ".github/workflows/ci.yml", ".env.example", "examples/ex-seller/seller.json", "tests/fixtures/content/fx-seller/seller.json"]));
    expect(listing(d)).not.toContain("old-history.txt");
  });

  it("carries no content/, .private, .env*, data/leads or node_modules, even when they are tracked", async () => {
    const dir = project({ "data/leads/a.json": "{}", ".env": "SECRET=1\n", ".env.local": "X=1\n", "node_modules/x/index.js": "1" });
    const d = dest();
    await run(dir, d);
    const files = listing(d);
    expect(files.filter((f) => /^(content|\.private|data\/leads|node_modules)(\/|$)/.test(f) || /(^|\/)\.env($|\.local)/.test(f))).toEqual([]);
    expect(files).toContain(".env.example");
  });

  it("does not take untracked files or uncommitted edits", async () => {
    const dir = project({}, { untracked: { "untracked-note.txt": "x" } });
    fs.writeFileSync(path.join(dir, "README.md"), "# edited, not committed\n");
    const d = dest();
    await run(dir, d);
    expect(listing(d)).not.toContain("untracked-note.txt");
    expect(fs.readFileSync(path.join(d, "README.md"), "utf8")).toBe("# template\n");
  });

  it("refuses while a seller folder is in the index, and leaves no folder behind", async () => {
    const d = dest();
    const dir = project({ "content/real-seller/seller.json": "{}\n" });
    await expect(run(dir, d)).rejects.toBeInstanceOf(TemplateExportRefused);
    expect(fs.existsSync(d)).toBe(false);
  });

  it("refuses a planted client folder that is only in the working tree", async () => {
    const dir = project({}, { untracked: { "content/planted/seller.json": "{}\n" } });
    await expect(run(dir, dest())).rejects.toThrow(/working tree: content\/planted/);
  });

  it("refuses a folder inside the repository, and a folder that is not empty", async () => {
    const dir = project();
    await expect(run(dir, path.join(dir, "export"))).rejects.toThrow(/outside this repository/);
    const full = dest();
    fs.mkdirSync(full);
    fs.writeFileSync(path.join(full, "x"), "1");
    await expect(run(dir, full)).rejects.toThrow(/not empty/);
  });

  it("refuses when a tracked template folder is missing", async () => {
    const dir = project();
    git(dir, "rm", "-rq", "tests/fixtures");
    git(dir, "commit", "-q", "-m", "drop fixtures");
    await expect(run(dir, dest())).rejects.toThrow(/tests\/fixtures: tracked template folder missing/);
  });

  it("refuses an image that still has EXIF, but not the fake GPS tag inside tests/fixtures", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } }).jpeg().withExif({ IFD0: { Copyright: "x" } }).toBuffer();
    const dir = project();
    fs.mkdirSync(path.join(dir, "tests/fixtures/content/fx-seller/p"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tests/fixtures/content/fx-seller/p/exif.jpg"), jpeg);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "fixture photo");
    await run(dir, dest()); // fine: fixtures are exempt
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs/shot.jpg"), jpeg);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "doc photo");
    await expect(run(dir, dest())).rejects.toThrow(/docs\/shot\.jpg: still has EXIF/);
  });

  it("does not carry a tracked content/ folder's original photos (the folder is dropped)", async () => {
    const dir = project();
    const clean = path.join(dir, "content");
    fs.mkdirSync(clean, { recursive: true });
    fs.writeFileSync(path.join(clean, "keep.txt"), "x"); // a file directly in content/ is no seller folder
    git(dir, "add", "-Af");
    git(dir, "commit", "-q", "-m", "stray file");
    const d = dest();
    const r = await run(dir, d).catch((e) => e);
    if (r instanceof Error) expect(r.message).toMatch(/content/); // a folder inside ./content counts as seller data
    else expect(r.files.some((f: { rel: string }) => f.rel.startsWith("content/"))).toBe(false);
  });
});

describe("the scan for the client's words and private terms", () => {
  /** A project with a private word list and a real-looking content root outside the repository. */
  const withWords = (files: Record<string, string>) => {
    const root = path.join(outside, `content${n++}`);
    fs.mkdirSync(path.join(root, "acme-seller", "acme-product"), { recursive: true });
    fs.writeFileSync(path.join(root, "acme-seller", "seller.json"), JSON.stringify({ displayName: "Zorbo Trading" }));
    fs.writeFileSync(path.join(root, "acme-seller", "acme-product", "product.json"), JSON.stringify({ title: { en: "Quasar Cruiser 9000" } }));
    const dir = project(files);
    fs.mkdirSync(path.join(dir, ".private"));
    fs.writeFileSync(path.join(dir, ".private", "client-words.txt"), "# client words\nBlorptastic\n");
    fs.writeFileSync(path.join(dir, ".private", "forbidden-terms.txt"), "Sekritword\n");
    return { dir, env: { CONTENT_DIR: root } };
  };

  it("refuses a hit in code, scripts, themes, tests and examples, naming file:line only", async () => {
    for (const [file, text, word] of [
      ["src/a.ts", "// ok\nconst x = 'Zorbo Trading';\n", "Zorbo"],
      ["scripts/b.mjs", "const t = 'Quasar Cruiser 9000';\n", "Quasar"],
      ["public/themes/c.css", "/* blorptastic */\n", "blorptastic"],
      ["tests/d.test.ts", "// SEKRITWORD\n", "SEKRITWORD"],
      ["examples/ex-seller/ex-product/e.md", "\n\nzorbo   trading\n", "trading"],
    ] as const) {
      const { dir, env } = withWords({ [file]: text });
      const d = dest();
      let message = "";
      try {
        await run(dir, d, env);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message, file).toMatch(new RegExp(`${file.replace(/[./]/g, "\\$&")}:\\d+: contains a client word or a private term`));
      expect(message.toLowerCase(), file).not.toContain(word.toLowerCase());
      expect(fs.existsSync(d), file).toBe(false);
    }
  });

  it("matches across no-break spaces and case", async () => {
    const { dir, env } = withWords({ "src/a.ts": "const x = 'ZORBO TRADING';\n" });
    await expect(run(dir, dest(), env)).rejects.toThrow(/src\/a\.ts:1:/);
  });

  it("only warns about a hit in docs/, PROJECT.md or PROGRESS.md, listed by file:line", async () => {
    const { dir, env } = withWords({ "docs/MOVE.md": "x\nZorbo Trading\n", "PROJECT.md": "Blorptastic\n", "PROGRESS.md": "Sekritword\n" });
    const lines: string[] = [];
    const r = await exportTemplate({ projectRoot: dir, dest: dest(), env, log: (l) => lines.push(l) });
    expect(r.warnings.sort()).toEqual(["PROGRESS.md:1", "PROJECT.md:1", "docs/MOVE.md:2"]);
    const text = lines.join("\n");
    expect(text).toContain("WARNING (review): docs/MOVE.md:2");
    expect(text.toLowerCase()).not.toMatch(/zorbo|blorptastic|sekritword/);
  });

  it("does not scan the private lists themselves into the export (they are not exported)", async () => {
    const { dir, env } = withWords({});
    const d = dest();
    await run(dir, d, env);
    expect(fs.existsSync(path.join(d, ".private"))).toBe(false);
  });
});

describe("the command", () => {
  it("needs --out", () => {
    const r = spawnSync("node", ["scripts/run.mjs", "scripts/export-template.mjs"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Pass --out/);
  });

  it("is a script of package.json", () => {
    expect(JSON.parse(fs.readFileSync("package.json", "utf8")).scripts["export:template"]).toContain("export-template.mjs");
  });
});
