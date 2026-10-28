import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { createSnapshot, SnapshotRefused } from "../scripts/lib/snapshot.mjs";
import { checkSnapshot, forbiddenReason, walk } from "../scripts/lib/snapshot-guard.mjs";

// A temporary template (a real git repository) and a temporary content root with two sellers; the first has two products.
const tmp = path.join(process.cwd(), ".test-tmp", "snapshot-whitelist");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => {
  for (const f of walk(tmp, tmp)) fs.chmodSync(path.dirname(f.full), 0o755); // a test locks a folder
  fs.rmSync(tmp, { recursive: true, force: true });
});

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...a], { cwd, encoding: "utf8" }).trim();
const mkdirFor = (file: string) => fs.mkdirSync(path.dirname(file), { recursive: true });
const plain = (file: string) => (mkdirFor(file), sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toFile(file));
const withExif = (file: string) =>
  (mkdirFor(file), sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "0/1 1/1 0/1" } }).jpeg().toFile(file));
const put = (root: string, rel: string, text = "x") => {
  const file = path.join(root, rel);
  mkdirFor(file);
  fs.writeFileSync(file, text);
};
const productJson = JSON.stringify({ media: { hero: "a.jpg", gallery: [] } });

// the dummy references used below: seller A with products 1 and 2, seller B with product 1
const CHOSEN = "sell-a/alpha-1";
const SIBLING = "sell-a/alpha-2"; // another product of the same seller
const OTHER = "sell-b/beta-1"; // a product of another seller

let counter = 0;
async function setup() {
  const base = path.join(tmp, `case-${++counter}`);
  const project = path.join(base, "project");
  const contentRoot = path.join(base, "content-root");
  put(project, "package.json", "{}");
  put(project, ".gitignore", "content/**/media/\ncontent/**/media-web/\n"); // as in the template
  for (const note of ["PROJECT.md", "PROGRESS.md", "README.md", "DEPLOY.md", "docs/audit.md"]) put(project, note, "notes\n");
  put(project, "src/a.ts", "export {};\n");
  put(project, ".github/workflows/ci.yml", "name: ci\n");
  put(project, "examples/ex-seller/ex/product.json", "{}");
  put(project, "tests/fixtures/content/f-seller/f/product.json", "{}");
  put(project, "content/tracked-seller/tracked/product.json", "{}"); // content tracked in the template (transitional): must not travel
  git(project, "init", "-q", "-b", "main");
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "template");
  for (const seller of ["sell-a", "sell-b"]) put(contentRoot, `${seller}/seller.json`, JSON.stringify({ displayName: seller }));
  for (const ref of [CHOSEN, SIBLING, OTHER]) {
    put(contentRoot, `${ref}/product.json`, productJson);
    await plain(path.join(contentRoot, ref, "media", "a.jpg"));
    await withExif(path.join(contentRoot, ref, "media", "IMG_0001.jpg")); // an original that product.json does not use
  }
  return { base, project, contentRoot, dest: path.join(base, "snapshot") };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const snapshot = (s: Setup, product = CHOSEN) => createSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product, dest: s.dest });
const names = (dest: string) => walk(dest).filter((f) => !f.rel.startsWith(".git/")).map((f) => f.rel);

describe("snapshot of one product", () => {
  it("holds the template, the product with its web copies and its seller's file, examples and fixtures, and nothing else", async () => {
    const s = await setup();
    const r = await snapshot(s);
    expect(names(s.dest)).toEqual([
      ".gitignore",
      "DEPLOY.md",
      "README.md",
      `content/${CHOSEN}/media-web/a.jpg`,
      `content/${CHOSEN}/product.json`,
      "content/sell-a/seller.json",
      "examples/ex-seller/ex/product.json",
      "package.json",
      "src/a.ts",
      "tests/fixtures/content/f-seller/f/product.json",
      "version.json",
    ]);
    expect(git(s.dest, "log", "--format=%s")).toBe("Demo snapshot");
    expect(git(s.dest, "remote")).toBe("");
    expect(r.files.map((f) => f.rel)).toEqual(names(s.dest));
  });

  it("leaves the development notes in the working repository, and keeps README and DEPLOY", async () => {
    const s = await setup();
    await snapshot(s);
    const all = names(s.dest);
    for (const gone of ["PROJECT.md", "PROGRESS.md", "docs/audit.md"]) expect(all).not.toContain(gone);
    for (const kept of ["README.md", "DEPLOY.md"]) expect(all).toContain(kept);
  });

  it("drops .github/ (the host builds the deployment repository; the workflow tests the examples)", async () => {
    const s = await setup();
    await snapshot(s);
    expect(names(s.dest).filter((f) => f === ".github" || f.startsWith(".github/"))).toEqual([]);
    expect(names(s.dest)).toContain("src/a.ts");
  });

  it("does not carry a second seller, a second product of the same seller, or content tracked in the template", async () => {
    const s = await setup();
    await snapshot(s);
    const all = names(s.dest);
    expect(all.filter((n) => n.includes("sell-b") || n.includes("beta-1"))).toEqual([]); // another seller
    expect(all.filter((n) => n.includes("alpha-2"))).toEqual([]); // another product of the same seller
    expect(all.filter((n) => n.includes("tracked"))).toEqual([]);
  });

  it("never reads the other seller's or the sibling product's folder (they can be locked)", async () => {
    const s = await setup();
    const locked = [path.join(s.contentRoot, "sell-b"), path.join(s.contentRoot, SIBLING)];
    for (const dir of locked) fs.chmodSync(dir, 0o000);
    try {
      await snapshot(s);
    } finally {
      for (const dir of locked) fs.chmodSync(dir, 0o755);
    }
    expect(fs.existsSync(path.join(s.dest, "content", "sell-b"))).toBe(false);
    expect(fs.existsSync(path.join(s.dest, "content", SIBLING))).toBe(false);
  });

  it("never copies the originals folder, and the web copy has no EXIF", async () => {
    const s = await setup();
    await snapshot(s);
    expect(names(s.dest).filter((n) => n.includes("/media/") || n.includes("IMG_0001"))).toEqual([]);
    expect((await sharp(path.join(s.dest, "content", CHOSEN, "media-web", "a.jpg")).metadata()).exif).toBeUndefined();
  });

  it("needs a valid <seller>/<product> that exists, and a folder outside the repository", async () => {
    const s = await setup();
    await expect(snapshot(s, "")).rejects.toThrow(/--product/);
    await expect(snapshot(s, "alpha-1")).rejects.toThrow(/--product/);
    await expect(snapshot(s, "sell-a/../sell-b/beta-1")).rejects.toThrow(/--product/);
    await expect(snapshot(s, "sell-a/gamma")).rejects.toThrow(/No product "sell-a\/gamma"/);
    await expect(createSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: CHOSEN, dest: path.join(s.project, "snap") })).rejects.toThrow(/outside/);
    fs.rmSync(path.join(s.contentRoot, "sell-a", "seller.json"));
    await expect(snapshot(s)).rejects.toThrow(/No seller\.json/);
  });

  it("refuses an existing folder unless it is a previous snapshot and --replace is given", async () => {
    const s = await setup();
    await snapshot(s);
    await expect(snapshot(s)).rejects.toThrow(/already exists/);
    await expect(createSnapshot({ projectRoot: s.project, contentRoot: s.contentRoot, product: CHOSEN, dest: s.dest, replace: true })).resolves.toBeTruthy();
  });
});

/** One kind of forbidden path per row: a file planted in a seller or product folder. */
const KINDS: [string, string, RegExp][] = [
  [".private folder", ".private/forbidden-terms.txt", /\.private folder/],
  [".env file", ".env.local", /\.env file/],
  ["data/leads", "data/leads/2026-10.jsonl", /data\/leads/],
  ["node_modules", "node_modules/p/index.js", /node_modules/],
  ["an image with EXIF in media-web", "media-web/a.jpg", /still has EXIF/],
];

describe.each(KINDS)("forbidden path: %s", (_name, rel, why) => {
  const plant = async (dir: string) => {
    if (rel.endsWith(".jpg")) await withExif(path.join(dir, rel));
    else put(dir, rel, "secret");
  };

  it("planted in another seller's folder or in a sibling product: not in the snapshot, and no refusal", async () => {
    const s = await setup();
    await plant(path.join(s.contentRoot, OTHER));
    await plant(path.join(s.contentRoot, SIBLING));
    if (!rel.startsWith("media-web/")) await plant(path.join(s.contentRoot, "sell-b")); // the other seller's own level
    await snapshot(s);
    expect(names(s.dest).filter((n) => n.includes("sell-b") || n.includes("alpha-2") || n.includes("beta-1"))).toEqual([]);
  });

  it("planted in the chosen product's folder: refused, and the snapshot folder is removed", async () => {
    const s = await setup();
    if (rel.startsWith("media-web/")) fs.rmSync(path.join(s.contentRoot, CHOSEN, "media"), { recursive: true }); // no originals: media-web is used as it is
    await plant(path.join(s.contentRoot, CHOSEN));
    const err = await snapshot(s).catch((e) => e);
    expect(err).toBeInstanceOf(SnapshotRefused);
    expect(err.problems.join("\n")).toMatch(why);
    expect(fs.existsSync(s.dest)).toBe(false);
  });

  it.skipIf(rel.startsWith("media-web/") || rel.startsWith("node_modules/") || rel.startsWith(".private/") || rel.startsWith("data/"))("planted among the chosen seller's own files: refused", async () => {
    const s = await setup();
    await plant(path.join(s.contentRoot, "sell-a"));
    const err = await snapshot(s).catch((e) => e);
    expect(err).toBeInstanceOf(SnapshotRefused);
    expect(err.problems.join("\n")).toMatch(why);
  });
});

describe("snapshot: content tracked in the template", () => {
  it("never travels, even an original photo inside it", async () => {
    const s = await setup();
    put(s.project, "content/x-seller/x/media/Front.jpg", "not really a jpeg"); // tracked content is removed from the archive...
    git(s.project, "add", "-f", "-A");
    git(s.project, "commit", "-q", "-m", "oops");
    await snapshot(s);
    expect(names(s.dest).some((n) => n.startsWith("content/x-seller"))).toBe(false); // ...so it never travels
  });
});

describe("audio in a snapshot", () => {
  it("takes a used track from media-web, never the originals or an unused track, and the guard accepts it", async () => {
    const s = await setup();
    const dir = path.join(s.contentRoot, CHOSEN);
    fs.writeFileSync(path.join(dir, "product.json"), JSON.stringify({ media: { hero: "a.jpg", gallery: [] }, music: { tracks: [{ id: "calm", title: { en: "Calm" }, file: "audio/calm.mp3", license: "test" }] } }));
    put(s.contentRoot, `${CHOSEN}/media/audio/calm.mp3`, "not music, a test file");
    put(s.contentRoot, `${CHOSEN}/media/audio/spare.mp3`, "not music either");
    await snapshot(s);
    const all = names(s.dest);
    expect(all).toContain(`content/${CHOSEN}/media-web/audio/calm.mp3`);
    expect(all.filter((n) => /spare\.mp3/.test(n))).toEqual([]);
    expect(all.filter((n) => /^content\/.*\/media\//.test(n))).toEqual([]); // no originals folder
    expect(fs.readFileSync(path.join(s.dest, "content", CHOSEN, "media-web", "audio", "calm.mp3"), "utf8")).toBe("not music, a test file");
    expect((await checkSnapshot(s.dest)).filter((p) => !p.startsWith(".git/"))).toEqual([]);
  });

  it("the guard accepts audio in media-web and refuses audio in media (an original), of any size", () => {
    expect(forbiddenReason("content/s/p/media-web/audio/calm.mp3", 3_000_000)).toBeNull();
    expect(forbiddenReason("content/s/p/media/audio/calm.mp3", 10)).toMatch(/original audio/);
    expect(forbiddenReason("content/p/media/audio/calm.wav", 10)).toMatch(/original audio/);
    expect(forbiddenReason("examples/ex-seller/ex/media/audio/a.wav", 10)).toBeNull(); // the template's own fake examples are not content
  });
});
