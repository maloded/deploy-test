import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const IMAGE = /\.(jpe?g|png|webp|gif|svg|heic|heif|avif|tiff?|ico)$/i;
const ALLOWED = ["examples/", "tests/fixtures/"];

describe("the template tracks no client photos", () => {
  it("git ls-files lists no image outside examples/ and tests/fixtures", () => {
    if (!fs.existsSync(path.join(root, ".git"))) return; // an export without history: nothing to list
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    const stray = tracked.filter((f) => IMAGE.test(f) && !ALLOWED.some((a) => f.startsWith(a)));
    expect(stray, "tracked images outside examples/ and tests/fixtures").toEqual([]);
  });

  it(".gitignore ignores photo folders anywhere under the content root", () => {
    const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
    expect(ignore).toContain("content/**/media/");
    expect(ignore).toContain("content/**/media-web/");
  });
});
