import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { mediaVersion } from "@/lib/content";

const root = path.join(process.cwd(), ".test-tmp", "media-version");
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("the version of a served photo", () => {
  const file = path.join(root, "public", "media", "s", "p", "a.jpg");
  const write = (bytes: number, seconds: number) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.alloc(bytes));
    fs.utimesSync(file, seconds, seconds);
  };

  it("is empty without a served copy (a test, a bare clone)", () => {
    expect(mediaVersion("s/p", "missing.jpg", root)).toBe("");
  });

  it("changes when the file changes, in size or in time, so the address of the picture changes with it", () => {
    write(100, 1_700_000_000);
    const a = mediaVersion("s/p", "a.jpg", root);
    expect(a).toMatch(/^\?v=[0-9a-z]+$/);
    write(100, 1_700_000_005);
    const b = mediaVersion("s/p", "a.jpg", root);
    write(101, 1_700_000_005);
    const c = mediaVersion("s/p", "a.jpg", root);
    expect(new Set([a, b, c]).size).toBe(3);
    write(100, 1_700_000_000); // the same file again: the same address
    expect(mediaVersion("s/p", "a.jpg", root)).toBe(a);
  });
});
