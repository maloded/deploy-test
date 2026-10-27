// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { loadEnvLocal } from "../scripts/lib/load-env-local.mjs";
import { FIXTURE_DIR, realContentRoot } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "env-local");
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-env-"));
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

let n = 0;
const project = (envLocal?: string) => {
  const dir = path.join(tmp, `p${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  if (envLocal !== undefined) fs.writeFileSync(path.join(dir, ".env.local"), envLocal);
  return dir;
};

describe("loadEnvLocal", () => {
  it("does nothing without a .env.local", () => {
    const env: Record<string, string | undefined> = {};
    expect(loadEnvLocal(project(), env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("sets variables from the file, with comments, quotes and blank lines", () => {
    const env: Record<string, string | undefined> = {};
    const names = loadEnvLocal(project('# a comment\n\nCONTENT_DIR="../some folder"\nCONTENT_PRODUCT=s/p\n'), env);
    expect(names).toEqual(["CONTENT_DIR", "CONTENT_PRODUCT"]);
    expect(env).toEqual({ CONTENT_DIR: "../some folder", CONTENT_PRODUCT: "s/p" });
  });

  it("lets real environment variables win, and returns only names", () => {
    const env: Record<string, string | undefined> = { CONTENT_DIR: "from-shell" };
    const names = loadEnvLocal(project("CONTENT_DIR=from-file\nOTHER=1\n"), env);
    expect(env.CONTENT_DIR).toBe("from-shell");
    expect(env.OTHER).toBe("1");
    expect(names).toEqual(["OTHER"]);
  });

  it("an empty value in the shell still counts as set", () => {
    const env: Record<string, string | undefined> = { CONTENT_DIR: "" };
    loadEnvLocal(project("CONTENT_DIR=from-file\n"), env);
    expect(env.CONTENT_DIR).toBe("");
  });
});

describe("the launcher and Vitest read .env.local", () => {
  const script = path.join(tmp, "print-env.mjs");
  fs.writeFileSync(script, 'console.log(process.env.PIPELINE_TEST_VAR ?? "unset");\n');

  const run = (dir: string, env: Record<string, string> = {}) =>
    execFileSync("node", [path.resolve("scripts/run.mjs"), script], { cwd: dir, encoding: "utf8", env: { ...process.env, PIPELINE_TEST_VAR: "", ...env } }).trim();

  it("scripts/run.mjs fills variables that are not in the environment", () => {
    const dir = project("PIPELINE_TEST_VAR=from-file\n");
    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.PIPELINE_TEST_VAR;
    const out = execFileSync("node", [path.resolve("scripts/run.mjs"), script], { cwd: dir, encoding: "utf8", env: env as NodeJS.ProcessEnv }).trim();
    expect(out).toBe("from-file");
  });

  it("scripts/run.mjs lets a real environment variable win", () => {
    expect(run(project("PIPELINE_TEST_VAR=from-file\n"), { PIPELINE_TEST_VAR: "from-shell" })).toBe("from-shell");
  });

  it("vitest.config.ts uses the same loader (a temporary project with a .env.local that sets CONTENT_DIR)", () => {
    const dir = project("CONTENT_DIR=value-from-env-local\n");
    fs.mkdirSync(path.join(dir, "tests"));
    const loader = pathToUrl(path.resolve("scripts/lib/load-env-local.mjs"));
    fs.writeFileSync(path.join(dir, "vitest.config.mjs"), `import { loadEnvLocal } from "${loader}";\nloadEnvLocal(import.meta.dirname);\nexport default { test: { include: ["tests/**/*.test.mjs"] } };\n`);
    fs.writeFileSync(path.join(dir, "tests", "env.test.mjs"), 'import { expect, it } from "vitest";\nit("sees CONTENT_DIR", () => expect(process.env.CONTENT_DIR).toBe("value-from-env-local"));\n');
    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.CONTENT_DIR;
    execFileSync(path.resolve("node_modules/.bin/vitest"), ["run", "--root", dir, "--config", path.join(dir, "vitest.config.mjs")], { cwd: dir, encoding: "utf8", stdio: "pipe", env: env as NodeJS.ProcessEnv });
  });

  it("the shipped vitest.config.ts calls the loader", () => {
    const text = fs.readFileSync("vitest.config.ts", "utf8");
    expect(text).toContain("loadEnvLocal(import.meta.dirname)");
  });
});

const pathToUrl = (p: string) => new URL(`file://${p}`).href;

describe("the helpers find the real content through CONTENT_DIR", () => {
  /** A content root outside the repository with one seller and one product slugged like the first client's. */
  const external = () => {
    const root = path.join(outside, `root${n++}`);
    fs.mkdirSync(path.join(root, "ext-seller", "vw-multivan"), { recursive: true });
    const fixtureSeller = fs.readdirSync(FIXTURE_DIR)[0];
    fs.copyFileSync(path.join(FIXTURE_DIR, fixtureSeller, "seller.json"), path.join(root, "ext-seller", "seller.json"));
    fs.copyFileSync(path.join(FIXTURE_DIR, fixtureSeller, "fixture-car", "product.json"), path.join(root, "ext-seller", "vw-multivan", "product.json"));
    return root;
  };

  it("realContentRoot follows CONTENT_DIR when it holds a product, else ./content", () => {
    const cwd = project();
    expect(realContentRoot({}, cwd)).toBe(path.join(cwd, "content"));
    expect(realContentRoot({ CONTENT_DIR: external() }, cwd)).toMatch(/root\d+$/);
    expect(realContentRoot({ CONTENT_DIR: path.join(outside, "missing") }, cwd)).toBe(path.join(cwd, "content"));
    const empty = path.join(outside, "empty");
    fs.mkdirSync(empty, { recursive: true });
    expect(realContentRoot({ CONTENT_DIR: empty }, cwd)).toBe(path.join(cwd, "content"));
    expect(realContentRoot({ CONTENT_DIR: "  " }, cwd)).toBe(path.join(cwd, "content"));
  });

  it("CONTENT_DIR=examples (or the fixtures) is fake data, not real content", () => {
    const cwd = project();
    fs.cpSync(external(), path.join(cwd, "examples"), { recursive: true });
    fs.cpSync(external(), path.join(cwd, "tests", "fixtures", "content"), { recursive: true });
    expect(realContentRoot({ CONTENT_DIR: "examples" }, cwd)).toBe(path.join(cwd, "content"));
    expect(realContentRoot({ CONTENT_DIR: path.join(cwd, "tests/fixtures/content") }, cwd)).toBe(path.join(cwd, "content"));
  });

  it("a relative CONTENT_DIR is resolved from the project root", () => {
    const cwd = project();
    fs.cpSync(external(), path.join(cwd, "ext"), { recursive: true });
    expect(realContentRoot({ CONTENT_DIR: "ext" }, cwd)).toBe(path.join(cwd, "ext"));
  });

  it("the helpers module then finds the product outside the repository (hasRealContent)", async () => {
    const root = external();
    vi.stubEnv("CONTENT_DIR", root);
    vi.resetModules();
    const h = await import("./helpers");
    expect(h.CONTENT_DIR).toBe(root);
    expect(h.hasRealContent).toBe(true);
    expect(h.content.root).toBe(root);
    expect(h.content.ref("vw-multivan")).toBe("ext-seller/vw-multivan");
    expect(h.content.sampleJson("vw-multivan").productType).toBeDefined();
    vi.unstubAllEnvs();
  });

  it("keeps skipping when CONTENT_DIR holds no such product and there is no ./content", async () => {
    const cwd = project();
    expect(realContentRoot({ CONTENT_DIR: path.join(outside, "missing") }, cwd)).toBe(path.join(cwd, "content"));
    vi.stubEnv("CONTENT_DIR", path.join(outside, "missing"));
    vi.resetModules();
    const h = await import("./helpers");
    expect(h.hasRealContent).toBe(h.hasRealContent && fs.existsSync(path.join(process.cwd(), "content"))); // only ./content can supply it
    vi.unstubAllEnvs();
  });
});
