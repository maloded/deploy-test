import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { createSnapshot, foreignHistoryReason, updateSnapshot, updateSummary } from "../scripts/lib/snapshot.mjs";

// A temporary template (a real git repository), a temporary content root and a deploy repository next to them.
const tmp = path.join(process.cwd(), ".test-tmp", "snapshot-update");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...a], { cwd, encoding: "utf8" }).trim();
const put = (root: string, rel: string, text = "x") => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const productJson = (title: string) => JSON.stringify({ title: { en: title }, media: { hero: "a.jpg", gallery: [] } });
const A = "sell-a/first-1";
const B = "sell-a/second-2"; // another product of the same seller, of "another type"

let counter = 0;
async function setup() {
  const base = path.join(tmp, `case-${++counter}`);
  const project = path.join(base, "project");
  const contentRoot = path.join(base, "content-root");
  put(project, ".gitignore", "content/**/media/\ncontent/**/media-web/\n");
  put(project, "README.md", "readme\n");
  put(project, "src/a.ts", "export {};\n");
  put(project, ".github/workflows/ci.yml", "name: ci\n");
  put(project, "examples/ex-seller/ex/product.json", "{}");
  put(project, "tests/fixtures/content/f-seller/f/product.json", "{}");
  git(project, "init", "-q", "-b", "main");
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "template");
  put(contentRoot, "sell-a/seller.json", JSON.stringify({ displayName: "Sell A" }));
  for (const ref of [A, B]) {
    put(contentRoot, `${ref}/product.json`, productJson(`title of ${ref}`));
    fs.mkdirSync(path.join(contentRoot, ref, "media"), { recursive: true });
    await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toFile(path.join(contentRoot, ref, "media", "a.jpg"));
  }
  const s = { base, project, contentRoot, dest: path.join(base, "deploy") };
  await createSnapshot({ projectRoot: project, contentRoot, product: A, dest: s.dest });
  return s;
}
type Setup = Awaited<ReturnType<typeof setup>>;
const update = (s: Setup, product = A) => updateSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product, dest: s.dest });
const subjects = (dest: string) => git(dest, "log", "--format=%s").split("\n");
const commitTemplate = (s: Setup, rel: string, text: string) => {
  put(s.project, rel, text);
  git(s.project, "add", "-A");
  git(s.project, "commit", "-q", "-m", `change ${rel}`);
};

describe("version.json in a snapshot", () => {
  it("is written in the snapshot root with hashes, a version and a date, and is committed", async () => {
    const s = await setup();
    const info = JSON.parse(fs.readFileSync(path.join(s.dest, "version.json"), "utf8"));
    expect(Object.keys(info).sort()).toEqual(["built", "content", "template", "version"]);
    expect(info.template).toBe(git(s.project, "rev-parse", "--short", "HEAD"));
    expect(info.built).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(git(s.dest, "ls-files")).toContain("version.json");
  });

  it("is not counted by --update: a real change goes along with a new version.json, which is not listed", async () => {
    const s = await setup();
    commitTemplate(s, "src/a.ts", "export const a = 1;\n");
    const r = await update(s);
    expect(r.changed).toEqual(["src/a.ts"]);
    expect(r.templateChanged).toEqual(["src/a.ts"]);
    expect(git(s.dest, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["src/a.ts", "version.json"]);
    expect(JSON.parse(fs.readFileSync(path.join(s.dest, "version.json"), "utf8")).template).toBe(git(s.project, "rev-parse", "--short", "HEAD"));
  });

  it("when only version.json would change there is no commit and the deploy folder stays clean", async () => {
    const s = await setup();
    const before = git(s.dest, "rev-parse", "HEAD");
    const old = fs.readFileSync(path.join(s.dest, "version.json"), "utf8");
    await new Promise((r) => setTimeout(r, 1100));
    const r = await update(s);
    expect(r).toMatchObject({ commit: null, changed: [], templateChanged: [] });
    expect(git(s.dest, "rev-parse", "HEAD")).toBe(before);
    expect(git(s.dest, "status", "--porcelain")).toBe("");
    expect(fs.readFileSync(path.join(s.dest, "version.json"), "utf8")).toBe(old);
  });
});

describe("snapshot --update", () => {
  it("a snapshot made before .github/ was dropped loses exactly the workflow files, and nothing else in the template", async () => {
    const s = await setup();
    expect(fs.existsSync(path.join(s.dest, ".github"))).toBe(false); // a new snapshot has none
    put(s.dest, ".github/workflows/ci.yml", "name: ci\n"); // as in an older snapshot
    put(s.dest, ".github/dependabot.yml", "version: 2\n");
    git(s.dest, "add", "-A");
    git(s.dest, "commit", "-q", "-m", "Update: older snapshot with the workflow");
    const r = await update(s);
    expect(r.templateChanged.sort()).toEqual([".github/dependabot.yml", ".github/workflows/ci.yml"]);
    expect(r.changed.sort()).toEqual([".github/dependabot.yml", ".github/workflows/ci.yml"]);
    expect(fs.existsSync(path.join(s.dest, ".github"))).toBe(false);
  });

  it("changing only product.json adds one commit, changes no template path and keeps the history linear", async () => {
    const s = await setup();
    const before = git(s.dest, "rev-parse", "HEAD");
    put(s.contentRoot, `${A}/product.json`, productJson("a new title"));
    const r = await update(s);
    expect(r.templateChanged).toEqual([]);
    expect(r.changed).toEqual(["content/sell-a/first-1/product.json"]);
    expect(subjects(s.dest)).toEqual(["Update: content/sell-a/first-1/product.json", "Demo snapshot"]);
    expect(git(s.dest, "rev-parse", "HEAD~1")).toBe(before); // on top of the old history, not instead of it
    expect(git(s.dest, "rev-list", "--merges", "HEAD")).toBe("");
    expect(fs.readFileSync(path.join(s.dest, "content/sell-a/first-1/product.json"), "utf8")).toContain("a new title");
    expect(r.pushCommand).toBe(`git -C ${s.dest} push origin main`);
  });

  it("a second update keeps the history linear, and a changed template file is listed", async () => {
    const s = await setup();
    put(s.contentRoot, `${A}/product.json`, productJson("one"));
    await update(s);
    commitTemplate(s, "src/a.ts", "export const changed = 1;\n");
    put(s.contentRoot, `${A}/product.json`, productJson("two"));
    const r = await update(s);
    expect(r.templateChanged).toEqual(["src/a.ts"]);
    expect(subjects(s.dest)).toHaveLength(3);
    expect(subjects(s.dest).every((x) => /^(Demo snapshot|Update: .+)$/.test(x))).toBe(true);
    expect(git(s.dest, "rev-list", "--merges", "HEAD")).toBe("");
    expect(git(s.dest, "rev-list", "--max-parents=1", "--count", "HEAD")).toBe("3");
  });

  it("nothing changed: no commit", async () => {
    const s = await setup();
    const r = await update(s);
    expect(r.commit).toBeNull();
    expect(r.changed).toEqual([]);
    expect(subjects(s.dest)).toEqual(["Demo snapshot"]);
  });

  it("a second product of the same seller replaces the first one in the snapshot; no template path changes", async () => {
    const s = await setup();
    const r = await update(s, B);
    expect(r.templateChanged).toEqual([]);
    expect(r.changed.some((p) => p.startsWith("content/sell-a/first-1/"))).toBe(true); // the old product leaves
    expect(r.changed.some((p) => p.startsWith("content/sell-a/second-2/"))).toBe(true);
    expect(fs.existsSync(path.join(s.dest, "content/sell-a/first-1"))).toBe(false);
    expect(fs.existsSync(path.join(s.dest, "content/sell-a/second-2/product.json"))).toBe(true);
  });

  it("keeps .git (a remote the owner added stays) and adds no remote itself", async () => {
    const s = await setup();
    expect(git(s.dest, "remote")).toBe("");
    git(s.dest, "remote", "add", "origin", "https://example.invalid/x.git");
    put(s.contentRoot, `${A}/product.json`, productJson("changed"));
    await update(s);
    expect(git(s.dest, "remote")).toBe("origin");
  });

  it("refuses a folder with foreign history, a plain folder, a missing folder and a dirty tree, and leaves them as they were", async () => {
    const s = await setup();
    const foreign = path.join(s.base, "foreign");
    put(foreign, "keep.txt", "mine");
    git(foreign, "init", "-q", "-b", "main");
    git(foreign, "add", "-A");
    git(foreign, "commit", "-q", "-m", "somebody else's work");
    const r = (dest: string) => updateSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: A, dest });
    await expect(r(foreign)).rejects.toThrow(/foreign history/);
    expect(fs.readFileSync(path.join(foreign, "keep.txt"), "utf8")).toBe("mine");
    const plain = path.join(s.base, "plain");
    put(plain, "x.txt");
    await expect(r(plain)).rejects.toThrow(/not a git repository/);
    await expect(r(path.join(s.base, "missing"))).rejects.toThrow(/does not exist/);
    put(s.dest, "stray.txt");
    await expect(update(s)).rejects.toThrow(/uncommitted changes/);
    expect(fs.existsSync(path.join(s.dest, "stray.txt"))).toBe(true);
  });

  it("refuses one foreign commit in the middle of otherwise good history", async () => {
    const s = await setup();
    put(s.dest, "extra.txt");
    git(s.dest, "add", "-A");
    git(s.dest, "commit", "-q", "-m", "manual fix");
    expect(foreignHistoryReason(s.dest)).toMatch(/1 commit\(s\) that are not/);
  });

  it("leaves the deploy repository untouched when the new snapshot is refused", async () => {
    const s = await setup();
    const before = git(s.dest, "rev-parse", "HEAD");
    await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "0/1 1/1 0/1" } }).jpeg().toFile(path.join(s.project, "stray.jpg"));
    git(s.project, "add", "-A");
    git(s.project, "commit", "-q", "-m", "photo with GPS in the template");
    await expect(update(s)).rejects.toThrow(/REFUSED[\s\S]*stray\.jpg/);
    expect(git(s.dest, "rev-parse", "HEAD")).toBe(before);
    expect(git(s.dest, "status", "--porcelain")).toBe("");
    expect(fs.readdirSync(path.dirname(s.dest)).filter((n) => n.startsWith(".snapshot-update-"))).toEqual([]);
  });

  it("builds the staging folder next to the deploy folder, not inside the template repository", async () => {
    const s = await setup();
    await expect(updateSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: A, dest: path.join(s.project, "deploy") })).rejects.toThrow(/outside this repository/);
  });
});

describe("updateSummary", () => {
  it("lists up to three paths and counts the rest, and shortens long ones", () => {
    expect(updateSummary(["a", "b"])).toBe("Update: a, b");
    expect(updateSummary(["a", "b", "c", "d", "e"])).toBe("Update: a, b, c and 2 more");
    expect(updateSummary(["x".repeat(60)])).toMatch(/^Update: \.\.\.x{37}$/);
  });
});
