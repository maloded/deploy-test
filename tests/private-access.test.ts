// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BRIDGE_FILE, privateAccessProblems } from "../scripts/lib/private-access.mjs";

const tmp = path.join(process.cwd(), ".test-tmp", "private-access");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const tree = (files: Record<string, string>) => {
  const dir = path.join(tmp, `t${n++}`);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
};

describe("the widget's internals are used in src/lib/hanc-bridge.ts only", () => {
  it("this project: no other file under src/ uses callManager, the room, lk.agent.state or participantAttributesChanged", () => {
    expect(privateAccessProblems(process.cwd())).toEqual([]);
    expect(fs.readFileSync(path.join(process.cwd(), BRIDGE_FILE), "utf8")).toMatch(/callManager/); // and the bridge is where they are
  });

  it("finds each private name in any other source file, with its line, and lets the bridge use them", () => {
    const dir = tree({
      [BRIDGE_FILE]: "const a = host.callManager.room; // lk.agent.state participantAttributesChanged",
      "src/components/A.tsx": "ok\nconst r = el.callManager;",
      "src/lib/b.ts": "x.on('participantAttributesChanged', f)",
      "src/lib/c.ts": "const s = p.attributes['lk.agent.state'];",
      "src/lib/d.ts": "const room = x.room;",
      "src/app/e.css": "/* room for the footer, the plain word is fine */",
    });
    const found = privateAccessProblems(dir).map((p) => `${p.file}:${p.line}`);
    expect(found.sort()).toEqual(["src/components/A.tsx:2", "src/lib/b.ts:1", "src/lib/c.ts:1", "src/lib/d.ts:1"]);
  });

  it("the bridge is the only exception", () => {
    expect(privateAccessProblems(tree({ [BRIDGE_FILE]: "callManager.room lk.agent.state" }))).toEqual([]);
    expect(privateAccessProblems(tree({ "src/lib/hanc-bridge2.ts": "callManager" })).length).toBe(1);
  });
});
