import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/version.json/route";

afterEach(() => vi.unstubAllEnvs());

describe("/version.json", () => {
  it("answers 404 unless NEXT_PUBLIC_PROTOTYPE_NOTE is set: a release does not publish its version", async () => {
    vi.stubEnv("VERSION_INFO", JSON.stringify({ version: "1.2.3", template: "abc1234", content: "def5678", built: "2026-10-30 08:00" }));
    for (const v of [undefined, ""]) {
      vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", v as string);
      const res = GET();
      expect(res.status, String(v)).toBe(404);
      expect(await res.text()).not.toMatch(/1\.2\.3|abc1234|def5678/);
    }
  });

  it("with the note on (the demo) it serves the inlined version, or {version: dev} in the working repository", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "1");
    vi.stubEnv("VERSION_INFO", JSON.stringify({ version: "1.2.3", template: "abc1234", content: null, built: null }));
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: "1.2.3", template: "abc1234", content: null, built: null });
    vi.stubEnv("VERSION_INFO", "");
    expect(await GET().json()).toEqual({ version: "dev" });
  });

  it("stays a static route (inlined at build time), and the 404 path never reads the version", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "app", "version.json", "route.ts"), "utf8");
    expect(src).toContain('export const dynamic = "force-static"');
    expect(src.indexOf("prototypeNoteEnabled()")).toBeLessThan(src.indexOf("currentVersion()")); // the check comes first
  });
});
