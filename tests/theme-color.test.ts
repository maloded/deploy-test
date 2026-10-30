/* eslint-disable @typescript-eslint/no-explicit-any -- the metadata object is read loosely */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMetadata, generateViewport } from "@/app/[lang]/layout";
import { listThemes } from "@/lib/themes";
import { themeColor } from "@/lib/theme-color";
import { FIXTURE_DIR, fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "theme-color");
const theme = (name: string, bg: string | null) => {
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, `${name}.css`), `/* ${name} */\n:root[data-theme="${name}"] {\n  --text: #111111;\n${bg === null ? "" : `  --bg: ${bg};\n`}  --surface: #222222;\n}\n`);
};
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("themeColor", () => {
  it("is the theme's --bg token, read from its css file: for every theme that ships", () => {
    for (const name of listThemes()) {
      const css = fs.readFileSync(path.join("public", "themes", `${name}.css`), "utf8");
      const bg = new RegExp(`:root\\[data-theme="${name}"\\]\\s*\\{[^}]*--bg:\\s*(#[0-9a-fA-F]{3,6})\\s*;`).exec(css)?.[1];
      expect(bg, name).toBeTruthy();
      expect(themeColor(name), name).toBe(bg);
    }
  });

  it("is a plain hex colour only: a missing token, a var(), a gradient, a name or an unknown theme gives none", () => {
    theme("hex6", "#0b0f17");
    theme("hex3", "#fff");
    theme("nobg", null);
    theme("withvar", "var(--surface)");
    theme("gradient", "linear-gradient(#000, #fff)");
    theme("named", "white");
    expect(themeColor("hex6", tmp)).toBe("#0b0f17");
    expect(themeColor("hex3", tmp)).toBe("#fff");
    for (const name of ["nobg", "withvar", "gradient", "named", "missing"]) expect(themeColor(name, tmp), name).toBeNull();
  });

  it("does not take --bg from another token such as --bg-alt or --surface-bg", () => {
    fs.writeFileSync(path.join(tmp, "similar.css"), ':root[data-theme="similar"] { --surface-bg: #123456; --bg-alt: #654321; }');
    expect(themeColor("similar", tmp)).toBeNull();
  });
});

describe("the page's viewport and icons", () => {
  beforeAll(() => {
    vi.stubEnv("CONTENT_DIR", FIXTURE_DIR);
    vi.stubEnv("CONTENT_PRODUCT", fixtures.ref("fixture-car"));
  });
  afterAll(() => vi.unstubAllEnvs());

  it("has the served theme's colour as themeColor", async () => {
    const site = fixtures.siteFor("fixture-car");
    const viewport = await generateViewport({ params: Promise.resolve({ lang: "en" }) });
    expect(viewport.themeColor).toBe(themeColor(site.theme));
    expect(viewport.themeColor).toMatch(/^#/);
  });

  it("has no icons of its own: only the seller's icon file, never an invented one (no apple-touch icon, no manifest)", async () => {
    const meta: any = await generateMetadata({ params: Promise.resolve({ lang: "en" }) });
    expect(meta).not.toHaveProperty("icons"); // the fixture seller has no icon.svg or icon.png
    expect(meta).not.toHaveProperty("manifest");
    const layout = fs.readFileSync(path.join(process.cwd(), "src", "app", "[lang]", "layout.tsx"), "utf8");
    expect(layout).not.toMatch(/apple|manifest|shortcut/i);
  });
});
