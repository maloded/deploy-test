// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { examples } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "template-alone");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** The first step of `npm run build` (`npm run images`), run in an empty project folder: it needs the content root. */
function images(env: Record<string, string>) {
  const cwd = fs.mkdtempSync(path.join(tmp, "p"));
  const clean = { ...process.env } as Record<string, string | undefined>;
  delete clean.CONTENT_DIR;
  delete clean.CONTENT_PRODUCT;
  const r = spawnSync("node", [path.resolve("scripts/run.mjs"), path.resolve("scripts/make-web-images.mjs")], { cwd, encoding: "utf8", env: { ...clean, ...env } as NodeJS.ProcessEnv });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, cwd };
}

describe("the template alone (no ./content folder)", () => {
  it("fails without CONTENT_DIR with a message that names CONTENT_DIR=examples", () => {
    const r = images({});
    expect(r.status).toBe(1);
    expect(r.out).toContain("CONTENT_DIR=examples");
    expect(r.out).not.toMatch(/\n\s+at .*\(|node:internal/); // a message, not a stack trace
  });

  it("an empty ./content folder gives the same hint", () => {
    const cwd = fs.mkdtempSync(path.join(tmp, "e"));
    fs.mkdirSync(path.join(cwd, "content"));
    const r = spawnSync("node", [path.resolve("scripts/run.mjs"), path.resolve("scripts/make-web-images.mjs")], { cwd, encoding: "utf8", env: { ...process.env, CONTENT_DIR: "" } as NodeJS.ProcessEnv });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("CONTENT_DIR=examples");
  });

  it("works with CONTENT_DIR=examples: the images step reads the example", () => {
    const r = images({ CONTENT_DIR: examples.root, CONTENT_PRODUCT: examples.ref("example-house") });
    expect(r.out).not.toMatch(/does not exist|holds no product/);
    expect(r.status).toBe(0);
  });

  it("DEPLOY.md has the section with the exact variables", () => {
    const text = fs.readFileSync("DEPLOY.md", "utf8");
    const section = text.slice(text.indexOf("## Deploy the template alone (preview of the examples)"));
    expect(section.startsWith("## Deploy the template alone")).toBe(true);
    expect(section).toContain("CONTENT_DIR=examples");
    expect(section).toContain(`CONTENT_PRODUCT=${examples.ref("example-house")}`);
    expect(section).toContain("CONTENT_SLUG");
  });
});
