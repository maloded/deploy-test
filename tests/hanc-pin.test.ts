// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// src/lib/hanc-bridge.ts reaches into the widget's internals, which are not API: they are known to work in this version only.
const PINNED = "2.11.0";
const json = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(process.cwd(), ...p), "utf8"));

describe("hanc-webrtc-widgets is pinned", () => {
  it("package.json asks for exactly the version the bridge was written against (no range, no caret)", () => {
    expect(json("package.json").dependencies["hanc-webrtc-widgets"]).toBe(PINNED);
  });
  it("the lock file and the installed package are that version", () => {
    expect(json("package-lock.json").packages["node_modules/hanc-webrtc-widgets"].version).toBe(PINNED);
    expect(json("node_modules", "hanc-webrtc-widgets", "package.json").version).toBe(PINNED);
  });
});
