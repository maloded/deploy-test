// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The free-text best time was replaced by the contact window; nothing the site ships or reads may name it any more. */
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

describe("no best time left", () => {
  it("src, the examples and the scripts do not mention bestTime or the old UI string", () => {
    const hits = ["src", "examples", "scripts"].flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx|json|mjs|css|md)$/.test(f)).filter((f) => /bestTime|contact\.bestTime|best time/i.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it(".env.example and the shipped docs name no bestTime field except in the breaking-change notes", () => {
    for (const file of ["docs/PAGE-API.md", "docs/LEADS.md"]) {
      const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => /bestTime/.test(l));
      for (const line of lines) expect(line, `${file}: ${line}`).toMatch(/removed|replaces|replaced|no longer|instead of|was/i);
    }
  });
});
