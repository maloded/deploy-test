// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { purgeLeads } from "../scripts/lib/leads-purge.mjs";
import { FILE_NAME, stamp } from "@/lib/leads";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leads-purge-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const NOW = new Date("2026-10-27T12:00:00Z");
const UUID = "123e4567-e89b-12d3-a456-426614174000";
let n = 0;
/** A leads folder with files of the given ages in days; their content is NOT json (a purge must not read them). */
function folder(ages: number[], extra: string[] = []) {
  const dir = path.join(tmp, `d${n++}`);
  fs.mkdirSync(dir);
  const names = ages.map((age, i) => `${stamp(new Date(NOW.getTime() - age * 86_400_000).toISOString())}-${UUID.slice(0, -2)}${String(i).padStart(2, "0")}.json`);
  names.forEach((f) => fs.writeFileSync(path.join(dir, f), "not json, never read"));
  extra.forEach((f) => fs.writeFileSync(path.join(dir, f), "other"));
  return { dir, names };
}

describe("leads:purge", () => {
  it("the file names the store writes are the ones the purge reads", () => {
    expect(`${stamp("2026-10-27T16:15:00.123Z")}-${UUID}.json`).toMatch(FILE_NAME);
  });

  it("a dry run counts the old files and deletes nothing", () => {
    const { dir, names } = folder([1, 30, 91, 400]);
    const r = purgeLeads({ dir, days: 90, now: NOW });
    expect(r).toMatchObject({ exists: true, total: 4, old: 2, kept: 2, deleted: 0 });
    expect(fs.readdirSync(dir).sort()).toEqual([...names].sort());
  });

  it("--write deletes exactly the older files", () => {
    const { dir, names } = folder([1, 30, 91, 400]);
    const r = purgeLeads({ dir, days: 90, write: true, now: NOW });
    expect(r).toMatchObject({ old: 2, deleted: 2, kept: 2 });
    expect(fs.readdirSync(dir).sort()).toEqual([names[0], names[1]].sort());
  });

  it("--days changes the cut-off; the day boundary keeps the file", () => {
    const { dir } = folder([6.9, 7.1]);
    expect(purgeLeads({ dir, days: 7, now: NOW })).toMatchObject({ old: 1, kept: 1 });
    expect(purgeLeads({ dir, days: 8, now: NOW })).toMatchObject({ old: 0, kept: 2 });
  });

  it("leaves anything that is not a lead file alone", () => {
    const { dir } = folder([500], ["notes.txt", ".gitkeep", "2020-old.json"]);
    fs.mkdirSync(path.join(dir, `20200101T000000Z-${UUID}.json`)); // a folder with a lead's name
    const r = purgeLeads({ dir, days: 90, write: true, now: NOW });
    expect(r).toMatchObject({ total: 1, deleted: 1, ignored: 4 });
    expect(fs.readdirSync(dir).sort()).toEqual([".gitkeep", "2020-old.json", `20200101T000000Z-${UUID}.json`, "notes.txt"]);
  });

  it("a missing folder is nothing to purge, and a bad --days is an error", () => {
    expect(purgeLeads({ dir: path.join(tmp, "missing"), days: 90 })).toMatchObject({ exists: false, total: 0 });
    for (const days of [0, -1, 1.5, NaN]) expect(() => purgeLeads({ dir: tmp, days })).toThrow(/--days/);
  });

  describe("the command", () => {
    const run = (args: string[], dir: string) => spawnSync("node", ["scripts/run.mjs", "scripts/leads-purge.mjs", ...args], { encoding: "utf8", env: { ...process.env, LEADS_DIR: dir } });

    it("is a dry run by default, prints counts only, and deletes with --write", () => {
      const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
      const dir = path.join(tmp, "cli");
      fs.mkdirSync(dir);
      const file = `${stamp(old)}-${UUID}.json`;
      fs.writeFileSync(path.join(dir, file), '{"name":"Hidden Person"}');
      const dry = run([], dir);
      expect(dry.status).toBe(0);
      expect(dry.stdout).toMatch(/1 lead file\(s\), 1 older than 90 day\(s\), 0 kept/);
      expect(dry.stdout).toContain("Dry run: nothing was deleted");
      expect(dry.stdout + dry.stderr).not.toContain("Hidden Person");
      expect(dry.stdout).not.toContain(file);
      expect(fs.existsSync(path.join(dir, file))).toBe(true);
      const wet = run(["--write", "--days", "30"], dir);
      expect(wet.stdout).toContain("Deleted 1 file(s).");
      expect(fs.existsSync(path.join(dir, file))).toBe(false);
    });

    it("rejects a bad --days and unknown arguments, and says so for a missing folder", () => {
      expect(run(["--days", "0"], tmp).status).toBe(1);
      expect(run(["--force"], tmp).status).toBe(1);
      expect(run([], path.join(tmp, "nope")).stdout).toContain("Nothing to purge");
    });

    it("is a script of package.json", () => {
      expect(JSON.parse(fs.readFileSync("package.json", "utf8")).scripts["leads:purge"]).toContain("leads-purge.mjs");
    });
  });
});
