import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listProducts } from "../src/lib/content-root";
import { loadTermsFile, textFiles } from "../scripts/lib/content-scan.mjs";
import { README_TITLE } from "../scripts/lib/snapshot-readme.mjs";
import { CONTENT_DIR } from "./helpers";

const root = process.cwd();

/**
 * Names that must not be literals in scripts or in the two docs a snapshot keeps: every real seller and product folder
 * (in ./content, or wherever CONTENT_DIR points) and the owner's own list in the git-ignored .private/client-words.txt.
 * Nothing is derived from the checkout's folder name, so the result does not depend on where the repository is cloned.
 * A clone without real content and without .private has no names to look for, and the test then has nothing to find.
 */
const names = [
  ...listProducts(CONTENT_DIR).flatMap((ref) => ref.split("/")),
  ...loadTermsFile(path.join(root, ".private", "client-words.txt")).terms,
].filter((n) => n.length >= 4);
// a deploy repository's README is generated and names its own product on purpose (the command to regenerate it), so it is not scanned
const isGenerated = (file: string) => fs.readFileSync(file, "utf8").startsWith(README_TITLE);
const files = [...textFiles(path.join(root, "scripts")), path.join(root, "README.md"), path.join(root, "DEPLOY.md")].filter((f) => !isGenerated(f));

describe("no project or client name is a literal in scripts, README or DEPLOY", () => {
  it("scans the scripts, the README and DEPLOY", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("finds none of the names (the seller and product folders, .private/client-words.txt)", () => {
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
