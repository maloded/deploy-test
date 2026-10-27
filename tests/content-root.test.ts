import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildSite } from "@/lib/site";
import {
  contentProduct,
  contentRoot,
  DEFAULT_CONTENT_DIR,
  listLegacyProducts,
  listProducts,
  listSellers,
  resolveContentDir,
  splitRef,
} from "@/lib/content-root";
import { examples } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "content-root");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const touch = (rel: string, text = "{}") => {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const project = path.join(tmp, "project"); // a pretend project root: relative values resolve from here
const outside = path.join(tmp, "elsewhere", "client-content"); // an absolute path that is not under the project root
touch("project/content/s-one/p-one/product.json");
touch("project/content/s-one/seller.json");
fs.cpSync(path.join(examples.root, examples.seller), path.join(outside, examples.seller), { recursive: true });

describe("resolving the content root", () => {
  it("defaults to ./content of the project root", () => {
    expect(DEFAULT_CONTENT_DIR).toBe("content");
    expect(resolveContentDir({}, project)).toBe(path.join(project, "content"));
    expect(resolveContentDir({ CONTENT_DIR: "  " }, project)).toBe(path.join(project, "content"));
  });

  it("resolves a relative value from the project root and accepts an absolute path", () => {
    expect(resolveContentDir({ CONTENT_DIR: "../client" }, project)).toBe(path.join(tmp, "client"));
    expect(resolveContentDir({ CONTENT_DIR: outside }, project)).toBe(outside);
  });

  it("fails with a clear message when the folder is missing", () => {
    const run = () => contentRoot({ CONTENT_DIR: path.join(tmp, "nope") }, project);
    expect(run).toThrow(/content folder does not exist/);
    expect(run).toThrow(/CONTENT_DIR/);
  });

  it("fails with a clear message when the folder holds no <seller>/<product>/product.json", () => {
    fs.mkdirSync(path.join(tmp, "empty", "sub"), { recursive: true });
    expect(() => contentRoot({ CONTENT_DIR: path.join(tmp, "empty") }, project)).toThrow(/holds no product.*<seller>\/<product>\/product\.json/);
  });

  it("names the migration when a product sits directly in the root (the old layout)", () => {
    touch("old/lonely/product.json");
    expect(listLegacyProducts(path.join(tmp, "old"))).toEqual(["lonely"]);
    expect(() => contentRoot({ CONTENT_DIR: path.join(tmp, "old") }, project)).toThrow(/old layout.*migrate-content\.mjs --seller/);
  });

  it("returns a valid folder", () => {
    expect(contentRoot({}, project)).toBe(path.join(project, "content"));
    expect(contentRoot({ CONTENT_DIR: outside }, project)).toBe(outside);
  });
});

describe("products and sellers", () => {
  it("lists products as <seller>/<product> and the seller folders", () => {
    expect(listProducts(outside)).toEqual([examples.ref("example-bag"), examples.ref("example-house"), examples.ref("example-watch")]);
    expect(listSellers(outside)).toEqual([examples.seller]);
    expect(listProducts(path.join(project, "content"))).toEqual(["s-one/p-one"]);
  });

  it("splits a reference and rejects anything else", () => {
    expect(splitRef("a-b/c-d")).toEqual({ seller: "a-b", product: "c-d" });
    for (const bad of ["a", "a/b/c", "/b", "a/", "A/b", "a/../b", ""]) expect(() => splitRef(bad), bad).toThrow(/not a product reference/);
  });

  it("picks CONTENT_PRODUCT, else the only product, else asks for CONTENT_PRODUCT", () => {
    expect(contentProduct({ CONTENT_PRODUCT: "x/y" }, outside)).toBe("x/y");
    expect(contentProduct({}, path.join(project, "content"))).toBe("s-one/p-one");
    expect(() => contentProduct({}, outside)).toThrow(/CONTENT_PRODUCT is not set.*example-bag/);
    expect(() => contentProduct({ CONTENT_PRODUCT: "not-a-ref" }, outside)).toThrow(/not a product reference/);
  });

  it("refuses the old CONTENT_SLUG with a message that names the new variable", () => {
    expect(() => contentProduct({ CONTENT_SLUG: "x" }, outside)).toThrow(/CONTENT_SLUG was replaced by CONTENT_PRODUCT=<seller>\/<product>/);
  });
});

describe("the app with CONTENT_DIR outside the project", () => {
  it("loads the site from the folder named by CONTENT_DIR and CONTENT_PRODUCT", () => {
    const before = { dir: process.env.CONTENT_DIR, product: process.env.CONTENT_PRODUCT, slug: process.env.CONTENT_SLUG };
    process.env.CONTENT_DIR = outside;
    process.env.CONTENT_PRODUCT = examples.ref("example-house");
    delete process.env.CONTENT_SLUG;
    try {
      const site = buildSite(null); // no contentDir, no reference: both come from the environment
      expect(site.product.slug).toBe("example-house");
      expect(site.ref).toBe(examples.ref("example-house"));
      expect(Object.keys(site.images)).toContain("hero.png");
    } finally {
      for (const [k, v] of [["CONTENT_DIR", before.dir], ["CONTENT_PRODUCT", before.product], ["CONTENT_SLUG", before.slug]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("no other code decides where the content is", () => {
  it('src/ and scripts/ never join a path with the literal "content" except content-root.ts', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx|mjs)$/.test(e.name) && e.name !== "content-root.ts") {
          fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
            if (/path\.join\([^)]*"content"/.test(line)) offenders.push(`${path.relative(process.cwd(), full)}:${i + 1}`);
          });
        }
      }
    };
    for (const d of ["src", "scripts"]) walk(path.join(process.cwd(), d));
    expect(offenders).toEqual([]);
  });
});
