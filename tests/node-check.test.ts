import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeProblem } from "../scripts/lib/node-check.mjs";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("Node version for the scripts", () => {
  it("accepts a Node that strips types and explains an older one", () => {
    expect(nodeProblem({ typescript: "strip" }, "v22.23.0")).toBeNull();
    expect(nodeProblem({ typescript: "transform" }, "v24.1.0")).toBeNull();
    const message = nodeProblem({ typescript: false }, "v22.12.0")!;
    expect(message).toContain("22.12.0");
    expect(message).toMatch(/22\.18/);
    expect(message).toMatch(/--experimental-strip-types/);
  });

  it("this Node can run the scripts", () => {
    expect(nodeProblem()).toBeNull();
  });

  it("pins a major version in engines.node (a range would let Vercel pick the newest major)", () => {
    expect(pkg.engines.node).toMatch(/^\d+\.x$/);
  });

  it("no npm script passes --experimental-strip-types; the TypeScript-importing ones go through the launcher", () => {
    for (const [name, command] of Object.entries<string>(pkg.scripts)) {
      expect(command, name).not.toContain("--experimental-strip-types");
      if (/\.mjs|\.ts/.test(command) && /images|snapshot|check:themes/.test(name)) expect(command, name).toContain("scripts/run.mjs");
    }
  });

  it("the launcher runs a script with its own arguments", () => {
    const out = execFileSync("node", ["scripts/run.mjs", "scripts/lib/echo-args.fixture.mjs", "--a", "b"], { cwd: root, encoding: "utf8" });
    expect(JSON.parse(out)).toEqual(["--a", "b"]);
  });
});
