import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  blankSections,
  clientWordHits,
  clientWords,
  contentScanFiles,
  productFolders,
  readFiles,
  sampleFolders,
  scanContentRoot,
  sellerFolders,
} from "../scripts/lib/content-scan.mjs";

// A temporary project: a content root with dummy sellers, a template with the dummy words planted in it.
const tmp = path.join(process.cwd(), ".test-tmp", "content-scan-roots");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const BRAND = "Zzqq Dummyhaus";
const TITLE = "Zzqq Dummy Roadster 9000";
const write = (rel: string, text: string) => {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const seller = (rel: string, displayName: string) => write(rel, JSON.stringify({ displayName }));
const product = (rel: string, title: string) => write(rel, JSON.stringify({ title: { en: title, de: `${title} (de)` } }));

seller("content/sell-one/seller.json", BRAND);
product("content/sell-one/prod-one/product.json", TITLE);
seller("content/sell-two/seller.json", "Qqzz Second Seller");
product("content/sell-two/prod-two/product.json", "Qqzz Second Title");
seller("examples/fake-seller/seller.json", "Examples Only Brand");
product("examples/fake-seller/fake-one/product.json", "Examples Only Title");
write("content/notes/readme.txt", "not a seller or a product");
write("docs/a.md", "docs\n");
write("README.md", "line one\nmade by zzqq dummyhaus\n"); // a hit (case-insensitive), line 2
write("PROJECT.md", `# P\n\n## Decisions\n${BRAND} is allowed here\n\n## Other\nclean\n`);
write("src/a.ts", `// 1\n// 2\nconst t = "${TITLE}";\n`); // a hit, line 3
write("tests/fixtures/f.ts", `${BRAND}`); // fixtures are not scanned
write("tests/ok.test.ts", "nothing\n");
write("scripts/s.mjs", "clean\n");
write("public/themes/t.css", "/* clean */\n");
const project = { projectRoot: tmp, contentRoot: path.join(tmp, "content") };
const relative = (list: string[], base = tmp) => list.map((f) => path.relative(base, f).split(path.sep).join("/")).sort();

describe("what the content scan lists", () => {
  it("lists every product folder (<seller>/<product>) and seller folder under the content root, and only examples/ is excluded", () => {
    expect(relative(productFolders(project.contentRoot, tmp))).toEqual(["content/sell-one/prod-one", "content/sell-two/prod-two"]);
    expect(relative(sellerFolders(project.contentRoot, tmp))).toEqual(["content/sell-one", "content/sell-two"]);
    // a content root that is examples/ itself has nothing left: the real scan test fails on zero folders
    expect(productFolders(path.join(tmp, "examples"), tmp)).toEqual([]);
  });

  it("lists the seller.json and product files, the docs folder and the root markdown files", () => {
    expect(relative(contentScanFiles(project))).toEqual([
      "PROJECT.md",
      "README.md",
      "content/sell-one/prod-one/product.json",
      "content/sell-one/seller.json",
      "content/sell-two/prod-two/product.json",
      "content/sell-two/seller.json",
      "docs/a.md",
    ]);
  });

  it("reports a listed path that was not read", () => {
    const { texts, unread } = readFiles([path.join(tmp, "docs", "a.md"), path.join(tmp, "docs", "gone.md")]);
    expect(texts.size).toBe(1);
    expect(relative(unread)).toEqual(["docs/gone.md"]);
  });
});

describe("client words", () => {
  it("come from every seller's displayName and every product title of the content root, whole strings", () => {
    const { terms } = clientWords(project);
    expect(terms).toEqual(expect.arrayContaining([BRAND, TITLE, `${TITLE} (de)`, "Qqzz Second Seller"]));
    expect(terms).not.toContain("Examples Only Brand"); // examples/ is not content
  });

  it("also come from .private/client-words.txt (comments and short entries ignored)", () => {
    write(".private/client-words.txt", "# comment\n\nzzqq-private-word\nab\n");
    const { terms, skipped } = clientWords(project);
    expect(terms).toEqual(expect.arrayContaining(["zzqq-private-word"]));
    expect(skipped).toBe(1);
    fs.rmSync(path.join(tmp, ".private"), { recursive: true });
  });

  it("are found in src, scripts, themes, tests and root docs, as file:line only", () => {
    expect(clientWordHits(project).sort()).toEqual(["README.md:2", "src/a.ts:3"]);
  });

  it("do not count in tests/fixtures or in PROJECT.md sections about decisions", () => {
    const hits = clientWordHits(project).join(" ");
    expect(hits).not.toContain("fixtures");
    expect(hits).not.toContain("PROJECT.md");
  });

  it("the hit list never contains a client word", () => {
    const out = JSON.stringify(clientWordHits(project)).toLowerCase();
    for (const word of ["zzqq", "dummy", "roadster"]) expect(out).not.toContain(word);
  });

  it("a word in a PROJECT.md section that is not about decisions is a hit", () => {
    write("PROJECT.md", `# P\n\n## Decisions\nok\n\n## Open questions\n${BRAND} again\n`);
    expect(clientWordHits(project)).toContain("PROJECT.md:7");
  });

  it("blankSections keeps the line numbers", () => {
    expect(blankSections("a\n## Decisions\nb\n## X\nc", /decisions/i).split("\n")).toEqual(["a", "", "", "## X", "c"]);
  });
});

describe("content root of the scan", () => {
  const bare = path.join(tmp, "bare"); // a template clone: examples, fixtures, docs, no content/
  seller("bare/examples/fake-seller/seller.json", "Fake Brand");
  product("bare/examples/fake-seller/fake-one/product.json", "Fake Title");
  seller("bare/tests/fixtures/content/fixture-seller/seller.json", "Fixture Brand");
  product("bare/tests/fixtures/content/fixture-seller/fixture-one/product.json", "Fixture Title");
  write("bare/docs/a.md", "docs\n");
  write("bare/README.md", "readme\n");
  const inBare = (list: string[]) => relative(list, bare);

  it("without CONTENT_DIR and without ./content there is no content root, and that is fine", () => {
    expect(scanContentRoot({ projectRoot: bare, env: {} })).toBeNull();
  });

  it("with no real content the scan lists examples/, the fixtures, the docs and the root markdown files", () => {
    expect(inBare(sampleFolders(bare))).toEqual(["examples/fake-seller", "tests/fixtures/content/fixture-seller"]);
    expect(inBare(contentScanFiles({ projectRoot: bare, contentRoot: null }))).toEqual([
      "README.md",
      "docs/a.md",
      "examples/fake-seller/fake-one/product.json",
      "examples/fake-seller/seller.json",
      "tests/fixtures/content/fixture-seller/fixture-one/product.json",
      "tests/fixtures/content/fixture-seller/seller.json",
    ]);
    expect(clientWords({ projectRoot: bare, contentRoot: null }).terms).toEqual([]); // nothing to derive client words from
  });

  it("an empty ./content (no product.json) is also no content", () => {
    fs.mkdirSync(path.join(bare, "content", "sub"), { recursive: true });
    expect(scanContentRoot({ projectRoot: bare, env: {} })).toBeNull();
    fs.rmSync(path.join(bare, "content"), { recursive: true });
  });

  it("./content with a product is the content root", () => {
    seller("bare/content/real-seller/seller.json", "Real Brand");
    product("bare/content/real-seller/real-one/product.json", "Real Title");
    expect(scanContentRoot({ projectRoot: bare, env: {} })).toBe(path.join(bare, "content"));
    fs.rmSync(path.join(bare, "content"), { recursive: true });
  });

  it("an explicit CONTENT_DIR that is missing, or holds no product, is an error", () => {
    expect(() => scanContentRoot({ projectRoot: bare, env: { CONTENT_DIR: "nope" } })).toThrow(/does not exist/);
    fs.mkdirSync(path.join(bare, "empty"), { recursive: true });
    expect(() => scanContentRoot({ projectRoot: bare, env: { CONTENT_DIR: "empty" } })).toThrow(/holds no product/);
  });

  it("an explicit CONTENT_DIR with a product is the content root", () => {
    seller("bare/elsewhere/s/seller.json", "Else Brand");
    product("bare/elsewhere/s/p/product.json", "Else Title");
    expect(scanContentRoot({ projectRoot: bare, env: { CONTENT_DIR: "elsewhere" } })).toBe(path.join(bare, "elsewhere"));
  });

  it("CONTENT_DIR=examples is the template's fake data: no content root, the fake samples are scanned", () => {
    expect(scanContentRoot({ projectRoot: bare, env: { CONTENT_DIR: "examples" } })).toBeNull();
  });
});
