// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { examples } from "./helpers";

const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const code = ci.replace(/^\s*#.*$/gm, ""); // the file without its comments

describe(".github/workflows/ci.yml", () => {
  it("runs on push and pull requests only", () => {
    expect(code).toMatch(/^on:\n {2}push:\n {2}pull_request:/m);
    expect(code).not.toMatch(/schedule:|workflow_dispatch:|release:/);
  });

  it("uses Node 22.x and installs with npm ci", () => {
    expect(code).toContain("node-version: 22.x");
    expect(code).toContain("run: npm ci");
  });

  it("runs lint, typecheck, test, check:themes and build, in this order", () => {
    const steps = [...code.matchAll(/run: (npm .+)/g)].map((m) => m[1]);
    expect(steps).toEqual(["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run check:themes", "npm run build"]);
  });

  it("builds the examples: CONTENT_DIR=examples and CONTENT_PRODUCT=<example seller>/<example product>", () => {
    expect(code).toMatch(/CONTENT_DIR: examples/);
    expect(code).toContain(`CONTENT_PRODUCT: ${examples.ref("example-house")}`);
  });

  it("has no secrets, no deploy step and no check:template-clean", () => {
    expect(code).not.toMatch(/secrets\./);
    expect(code).not.toMatch(/\bdeploy|vercel|npm publish|git push|--token/i);
    expect(code).not.toContain("template-clean");
    expect(code).toMatch(/permissions:\n {2}contents: read/);
  });

  it("does not set CONTENT_DIR for the tests (they must pass with no real content and nothing set)", () => {
    const testStep = code.slice(code.indexOf("run: npm test"), code.indexOf("run: npm run check:themes"));
    expect(testStep).not.toContain("CONTENT_DIR");
  });
});
