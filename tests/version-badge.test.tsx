import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Footer, footerVersionLine } from "@/components/Footer";
import { GET } from "@/app/version.json/route";
import { cleanVersionInfo, currentVersion, versionEnv, versionLine } from "@/lib/version";
import { buildVersionInfo } from "../scripts/lib/version-info.mjs";
import { versionToWrite, writeVersion } from "../scripts/write-version.mjs";
import { verifyDeploy } from "../scripts/lib/verify-deploy.mjs";
import { fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "version-badge");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...a], { cwd, encoding: "utf8" }).trim();
const put = (root: string, rel: string, text = "x") => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const repo = (dir: string, files: Record<string, string>) => {
  for (const [rel, text] of Object.entries(files)) put(dir, rel, text);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "first");
};
const NOW = new Date(Date.UTC(2026, 9, 28, 14, 10, 59));
const HASH = /^[0-9a-f]{7,}$/;

describe("version info (scripts/lib/version-info.mjs)", () => {
  it("has the shape { version, template, content, built } and nothing else", () => {
    const project = path.join(tmp, "shape", "project");
    const content = path.join(tmp, "shape", "content");
    repo(project, { "package.json": JSON.stringify({ name: "x", version: "0.2.0" }), "a.txt": "a" });
    repo(content, { "s/seller.json": "{}" });
    const info = buildVersionInfo({ projectRoot: project, contentRoot: content, now: NOW });
    expect(Object.keys(info).sort()).toEqual(["built", "content", "template", "version"]);
    expect(info.version).toBe("0.2.0");
    expect(info.template).toBe(git(project, "rev-parse", "--short", "HEAD"));
    expect(info.content).toBe(git(content, "rev-parse", "--short", "HEAD"));
    expect(info.template).toMatch(HASH);
    expect(info.built).toBe("2026-10-28 14:10");
    expect(JSON.stringify(info)).not.toMatch(/\/|@/); // no paths, no names
  });

  it("adds -dirty to the template for a changed tracked file, not for a new untracked one", () => {
    const project = path.join(tmp, "dirty-t", "project");
    const content = path.join(tmp, "dirty-t", "content");
    repo(project, { "a.txt": "a" });
    repo(content, { "s/seller.json": "{}" });
    put(project, "new.txt", "untracked");
    expect(buildVersionInfo({ projectRoot: project, contentRoot: content, now: NOW }).template).toMatch(HASH);
    expect(buildVersionInfo({ projectRoot: project, contentRoot: content, now: NOW }).template).not.toContain("dirty");
    put(project, "a.txt", "changed");
    expect(buildVersionInfo({ projectRoot: project, contentRoot: content, now: NOW }).template).toMatch(/^[0-9a-f]+-dirty$/);
  });

  it("adds -dirty to the content for any uncommitted change, new files included", () => {
    const project = path.join(tmp, "dirty-c", "project");
    const content = path.join(tmp, "dirty-c", "content");
    repo(project, { "a.txt": "a" });
    repo(content, { "s/seller.json": "{}" });
    expect(buildVersionInfo({ projectRoot: project, contentRoot: content, now: NOW }).content).toMatch(HASH);
    put(content, "s/new.json", "{}");
    expect(buildVersionInfo({ projectRoot: project, contentRoot: content, now: NOW }).content).toMatch(/-dirty$/);
  });

  it("content is null when the content root is in the template repository or in no repository, and the version is null without package.json", () => {
    const project = path.join(tmp, "nullc", "project");
    repo(project, { "a.txt": "a", "content/s/seller.json": "{}" });
    const info = buildVersionInfo({ projectRoot: project, contentRoot: path.join(project, "content"), now: NOW });
    expect(info).toMatchObject({ content: null, version: null });
    expect(buildVersionInfo({ projectRoot: project, contentRoot: path.join(tmp, "nullc", "missing"), now: NOW }).content).toBeNull();
  });

  it("the real package version is what version-info reports (no literal: it follows npm version)", () => {
    const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(buildVersionInfo({ projectRoot: process.cwd(), contentRoot: path.join(tmp, "no-content"), now: NOW }).version).toBe(version);
  });
});

describe("version.ts: reading, cleaning and the line", () => {
  const FULL = { version: "0.2.0", template: "9328a8e", content: "4b59167", built: "2026-10-28 14:10" };

  it("builds the line, leaves out what is missing, says dev without data", () => {
    expect(versionLine(FULL)).toBe("v0.2.0 · template 9328a8e · content 4b59167 · 2026-10-28 14:10 UTC");
    expect(versionLine({ ...FULL, content: null })).toBe("v0.2.0 · template 9328a8e · 2026-10-28 14:10 UTC");
    expect(versionLine({ ...FULL, template: "9328a8e-dirty" })).toContain("template 9328a8e-dirty");
    expect(versionLine(null)).toBe("dev");
  });

  it("keeps only values of the expected shape: no names, paths or secrets get through", () => {
    expect(cleanVersionInfo({ ...FULL, extra: "secret", note: "a name" })).toEqual(FULL);
    expect(cleanVersionInfo({ version: "x", template: "/home/someone/repo", content: "Some Client", built: "yesterday" })).toBeNull();
    expect(cleanVersionInfo({ ...FULL, content: "Some Client" })).toEqual({ ...FULL, content: null });
    expect(cleanVersionInfo("text")).toBeNull();
    expect(currentVersion({ VERSION_INFO: "not json" })).toBeNull();
    expect(currentVersion({})).toBeNull();
  });

  it("versionEnv reads version.json of the project root for next.config.ts, and gives {} without it", () => {
    const dir = path.join(tmp, "env");
    put(dir, "version.json", JSON.stringify(FULL));
    expect(JSON.parse(versionEnv(dir).VERSION_INFO)).toEqual(FULL);
    expect(versionEnv(path.join(tmp, "nowhere"))).toEqual({});
    put(dir, "version.json", "{broken");
    expect(versionEnv(dir)).toEqual({});
  });
});

describe("a build without version.json (the Docker image) still has a version line", () => {
  const FULL = { version: "0.2.0", template: "9328a8e", content: "4b59167", built: "2026-10-28 14:10" };
  it("versionEnv falls back to the version of package.json when asked to (a production build), and keeps {} otherwise (development says dev)", () => {
    const dir = path.join(tmp, "fallback");
    put(dir, "package.json", JSON.stringify({ name: "x", version: "0.11.0" }));
    expect(versionEnv(dir)).toEqual({});
    expect(JSON.parse(versionEnv(dir, { fallbackToPackage: true }).VERSION_INFO)).toEqual({ version: "0.11.0", template: null, content: null, built: null });
    // a version.json wins over the fallback
    put(dir, "version.json", JSON.stringify(FULL));
    expect(JSON.parse(versionEnv(dir, { fallbackToPackage: true }).VERSION_INFO)).toEqual(FULL);
    // nothing usable anywhere: nothing (the footer then says dev)
    const bare = path.join(tmp, "fallback-bare");
    put(bare, "package.json", JSON.stringify({ name: "x" }));
    expect(versionEnv(bare, { fallbackToPackage: true })).toEqual({});
    expect(versionEnv(path.join(tmp, "fallback-none"), { fallbackToPackage: true })).toEqual({});
  });

  it("the footer line is never empty: a release build with no version says dev, and with only a version says v<version>", () => {
    expect(footerVersionLine(null, true)).toBe("dev");
    expect(footerVersionLine(null, false)).toBe("dev");
    expect(footerVersionLine({ version: null, template: "abc1234", content: null, built: null }, true)).toBe("dev"); // no commit hashes in a release
    expect(footerVersionLine({ version: "0.11.0", template: null, content: null, built: null }, true)).toBe("v0.11.0");
    expect(footerVersionLine({ version: "0.11.0", template: null, content: null, built: null }, false)).toBe("v0.11.0");
  });

  it("scripts/write-version.mjs writes the snapshot's version.json from package.json, the clock and the commits it is given", () => {
    const dir = path.join(tmp, "write");
    put(dir, "package.json", JSON.stringify({ version: "0.11.0" }));
    const env = { TEMPLATE_COMMIT: "3FD922C1234567890", CONTENT_COMMIT: "4bd3e25", CONTENT_DIR: "content-repo" };
    const result = writeVersion({ projectRoot: dir, env, now: NOW });
    expect(result.written).toBe(true);
    const file = JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8"));
    expect(file).toEqual({ version: "0.11.0", template: "3fd922c", content: "4bd3e25", built: "2026-10-28 14:10" });
    expect(cleanVersionInfo(file)).toEqual(file); // the shape the page accepts
    expect(JSON.parse(versionEnv(dir).VERSION_INFO)).toEqual(file);
  });

  it("takes only hash-shaped commits from the environment, leaves a missing one out, and never overwrites an existing version.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-odd-")); // outside this repository: git has nothing to say about it
    try {
      put(dir, "package.json", JSON.stringify({ version: "0.11.0" }));
      const odd = versionToWrite({ projectRoot: dir, contentRoot: path.join(dir, "nowhere"), env: { TEMPLATE_COMMIT: "/home/someone/repo", CONTENT_COMMIT: "" }, now: NOW });
      expect(odd).toEqual({ version: "0.11.0", template: null, content: null, built: "2026-10-28 14:10" });
      put(dir, "version.json", JSON.stringify(FULL));
      expect(writeVersion({ projectRoot: dir, env: {}, now: NOW }).written).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8"))).toEqual(FULL);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the Dockerfile writes it before the build, with the two commit arguments, and next.config.ts asks for the fallback in production only", () => {
    const docker = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
    expect(docker).toMatch(/ARG TEMPLATE_COMMIT\s+ARG CONTENT_COMMIT\s+RUN node scripts\/write-version\.mjs\s+RUN npm run build/);
    const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('versionEnv(process.cwd(), { fallbackToPackage: process.env.NODE_ENV === "production" })');
  });
});

describe("the footer line", () => {
  const html = () => renderToStaticMarkup(<Footer site={fixtures.siteFor("fixture-car")} />);
  const INFO = JSON.stringify({ version: "0.2.0", template: "9328a8e", content: "4b59167", built: "2026-10-28 14:10" });

  it("is always shown, with or without NEXT_PUBLIC_PROTOTYPE_NOTE (the footer's quiet last line)", () => {
    vi.stubEnv("VERSION_INFO", INFO);
    for (const flag of ["", "1"]) {
      vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", flag);
      expect(html()).toContain('<p class="site-footer__version">v0.2.0 · template 9328a8e · content 4b59167 · 2026-10-28 14:10 UTC</p>');
    }
  });

  it('says "dev" in the working repository (no version.json)', () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "");
    vi.stubEnv("VERSION_INFO", "");
    expect(html()).toContain('<p class="site-footer__version">dev</p>');
  });

  it("uses theme variables only (an optional --font-mono with a monospace fallback, no raw colour)", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    const rule = /^\.site-footer__version \{([^}]*)\}/m.exec(css)![1];
    expect(rule).toMatch(/font-family: var\(--font-mono, monospace\)/);
    expect(rule).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});

describe("/version.json", () => {
  it("is a static route handler that serves the inlined JSON, or {version:dev}", async () => {
    expect(fs.readFileSync("src/app/version.json/route.ts", "utf8")).toContain('dynamic = "force-static"');
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "1"); // served only where the prototype note is on (see tests/version-route.test.ts)
    vi.stubEnv("VERSION_INFO", JSON.stringify({ version: "0.2.0", template: "9328a8e", content: null, built: "2026-10-28 14:10" }));
    expect(await GET().json()).toEqual({ version: "0.2.0", template: "9328a8e", content: null, built: "2026-10-28 14:10" });
    vi.stubEnv("VERSION_INFO", "");
    expect(await GET().json()).toEqual({ version: "dev" });
  });
});

describe("verify:deploy and the version", () => {
  const html = "<html lang=\"en\"><head></head><body></body></html>";
  const fetchWith = (version: unknown) =>
    (async (target: string | URL) => {
      const url = new URL(String(target));
      if (url.pathname === "/version.json") return version === undefined ? new Response("nope", { status: 404 }) : new Response(JSON.stringify(version), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
  const run = async (version: unknown, expectTemplate?: string) => {
    const results = await verifyDeploy({ url: "https://site.example/", fetchImpl: fetchWith(version), expectTemplate });
    return results.find((r: { name: string }) => r.name.startsWith("deployed version"))!;
  };
  const INFO = { version: "0.2.0", template: "9328a8e", content: "4b59167", built: "2026-10-28 14:10" };

  it("prints the deployed version", async () => {
    expect(await run(INFO)).toMatchObject({ ok: true, level: "info", reason: "v0.2.0 · template 9328a8e · content 4b59167 · 2026-10-28 14:10 UTC" });
  });
  it("without the file: 'version unknown', a warning and not a failure", async () => {
    expect(await run(undefined)).toMatchObject({ ok: true, level: "warn", reason: "version unknown" });
    expect(await run({ junk: true })).toMatchObject({ ok: true, level: "warn", reason: "version unknown" });
  });
  it("--expect-template passes on the same hash and fails on another one, a -dirty one or no version", async () => {
    expect(await run(INFO, "9328a8e")).toMatchObject({ ok: true });
    expect(await run(INFO, "1111111")).toMatchObject({ ok: false });
    expect((await run(INFO, "1111111")).reason).toContain("expected 1111111");
    expect(await run({ ...INFO, template: "9328a8e-dirty" }, "9328a8e")).toMatchObject({ ok: false });
    expect(await run(undefined, "9328a8e")).toMatchObject({ ok: false });
  });
});
