import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listProducts } from "../src/lib/content-root";
import { textFiles } from "../scripts/lib/content-scan.mjs";
import { CONTENT_DIR } from "./helpers";

const root = process.cwd();

/**
 * Names that must not be literals in scripts or in the two docs a snapshot keeps: this project's folder and every real
 * seller and product folder (in ./content, or wherever CONTENT_DIR points). On a CI runner the project folder is just
 * the repository's name, which says nothing about a client, so it is not checked there (CI=true).
 */
const names = [...(process.env.CI ? [] : [path.basename(root)]), ...listProducts(CONTENT_DIR).flatMap((ref) => ref.split("/"))].filter((n) => n.length >= 4);
const files = [...textFiles(path.join(root, "scripts")), path.join(root, "README.md"), path.join(root, "DEPLOY.md")];

describe("no project or client name is a literal in scripts, README or DEPLOY", () => {
  it("checks something", () => {
    expect(names.length > 0 || Boolean(process.env.CI)).toBe(true); // a runner without real content has no names to look for
    expect(files.length).toBeGreaterThan(3);
  });

  it("finds none of the names (the project folder, the seller and product folders)", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").toLowerCase().split("\n");
      lines.forEach((line, i) => {
        if (names.some((n) => line.includes(n.toLowerCase()))) hits.push(`${path.relative(root, file)}:${i + 1}`);
      });
    }
    expect(hits, "a project or product name appears at").toEqual([]);
  });
});
