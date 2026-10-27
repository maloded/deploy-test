import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadTermsFile, matchingLines, MIN_TERM_LENGTH, parseTerms } from "../scripts/lib/content-scan.mjs";

const tmp = path.join(process.cwd(), ".test-tmp", "content-scan");
fs.mkdirSync(tmp, { recursive: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const DUMMY = "zzqq-dummy-word"; // harmless: not a real private term
const write = (name: string, text: string) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, text);
  return file;
};

describe("private term list", () => {
  it("a missing file means no extra terms", () => {
    expect(loadTermsFile(path.join(tmp, "does-not-exist.txt"))).toEqual({ terms: [], skipped: 0 });
  });

  it("an empty file means no extra terms, and the scan finds nothing", () => {
    const list = loadTermsFile(write("empty.txt", ""));
    expect(list).toEqual({ terms: [], skipped: 0 });
    expect(matchingLines(`any text ${DUMMY}`, list.terms)).toEqual([]);
  });

  it("ignores empty lines, whitespace-only lines and comments, and trims each entry", () => {
    const list = loadTermsFile(write("mixed.txt", `\n   \n\t\n# a comment\n  # an indented comment\n  ${DUMMY}  \n\r\n`));
    expect(list).toEqual({ terms: [DUMMY], skipped: 0 });
  });

  it("skips entries shorter than 4 characters and reports only how many", () => {
    const list = loadTermsFile(write("short.txt", `ab\nabc\n${DUMMY}\n  xy  \nabcd\n`));
    expect(MIN_TERM_LENGTH).toBe(4);
    expect(list.terms).toEqual([DUMMY, "abcd"]);
    expect(list.skipped).toBe(3);
    expect(Object.keys(list)).toEqual(["terms", "skipped"]); // the skipped entries themselves are not kept anywhere
  });

  it("does not duplicate a repeated term", () => {
    expect(parseTerms(`${DUMMY}\n${DUMMY}\n`).terms).toEqual([DUMMY]);
  });

  it("matches case-insensitively and returns only line numbers", () => {
    const hits = matchingLines(`first line\nsecond ${DUMMY.toUpperCase()} line\nthird\n${DUMMY}`, [DUMMY]);
    expect(hits).toEqual([2, 4]);
    expect(JSON.stringify(hits)).not.toContain(DUMMY);
  });

  it("a real match fails the scan with a message that has the file and line but not the term", () => {
    const content = write("scanned.md", `harmless\nthis line has ${DUMMY} in it\n`);
    const terms = loadTermsFile(write("terms.txt", `# list\n${DUMMY}\n`)).terms;
    const hits = matchingLines(fs.readFileSync(content, "utf8"), terms).map((line) => `${path.relative(process.cwd(), content)}:${line}`);
    expect(hits).toEqual([".test-tmp/content-scan/scanned.md:2"]);

    // the same assertion the real scan uses; capture its failure message
    let message = "";
    try {
      expect(hits.length === 0, `a private term was found at: ${hits.join(", ")} (the term itself is never printed)`).toBe(true);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(".test-tmp/content-scan/scanned.md:2");
    expect(message).not.toContain(DUMMY);
  });
});
