import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAllThemes, declaredVars, listThemes, missingVars, OPTIONAL_VARS, REQUIRED_VARS, resolveTheme, unknownVars } from "@/lib/themes";
import { varsWithoutFallback } from "@/lib/theme-check";

const themesDir = path.join(process.cwd(), "public", "themes");

describe("theme files", () => {
  it("finds both themes", () => {
    expect(listThemes()).toEqual(["dark-premium", "light-editorial"]);
  });

  it("define every required variable", () => {
    for (const { theme, missing } of checkAllThemes()) {
      expect(missing, `theme ${theme}`).toEqual([]);
    }
  });

  it("only declare variables inside their own :root block", () => {
    for (const theme of listThemes()) {
      const css = fs.readFileSync(path.join(themesDir, `${theme}.css`), "utf8");
      expect(declaredVars(css, theme).length).toBeGreaterThanOrEqual(REQUIRED_VARS.length);
    }
  });
});

describe("missingVars", () => {
  const css = fs.readFileSync(path.join(themesDir, "light-editorial.css"), "utf8");

  it("fails when one variable is removed", () => {
    const broken = css.replace(/^\s*--radius:.*$/m, "");
    expect(missingVars(broken, "light-editorial")).toEqual(["--radius"]);
  });

  it("fails when the :root block is for another theme name", () => {
    expect(missingVars(css, "other")).toEqual(REQUIRED_VARS);
  });

  it("ignores variables that sit outside the theme block", () => {
    const moved = css.replace(/^\s*--radius:.*$/m, "") + '\n.x { --radius: 0; }\n';
    expect(missingVars(moved, "light-editorial")).toEqual(["--radius"]);
  });
});

describe("resolveTheme", () => {
  const available = ["dark-premium", "light-editorial"];

  it("returns a known theme", () => {
    expect(resolveTheme("dark-premium", { available, isDev: true })).toEqual({ theme: "dark-premium" });
  });

  it("throws a clear error in development", () => {
    expect(() => resolveTheme("nope", { available, isDev: true })).toThrow(/Unknown theme "nope".*dark-premium, light-editorial/);
  });

  it("falls back to the default in production", () => {
    const r = resolveTheme("nope", { available, isDev: false });
    expect(r.theme).toBe("light-editorial");
    expect(r.warning).toMatch(/Unknown theme "nope"/);
  });
});

describe("components use theme variables only", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(css|tsx?)$/.test(entry.name)) files.push(p);
    }
  };
  walk(path.join(process.cwd(), "src"));

  it("has no raw hex or rgb colors", () => {
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/#[0-9a-f]{3,8}\b(?![\w-])/i);
      expect(src, f).not.toMatch(/\b(rgb|hsl)a?\(/i);
    }
  });

  it("has no font-family other than a variable", () => {
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/font-family:\s*([^;]+);/g)) {
        expect(m[1].trim(), f).toMatch(/^var\(--font-(heading|body)\)$/);
      }
    }
  });
});

describe("optional theme variables", () => {
  const css = (t: string) => fs.readFileSync(path.join(themesDir, `${t}.css`), "utf8");

  it("--accent-line is optional: set in light-editorial, left out of dark-premium", () => {
    expect(OPTIONAL_VARS).toEqual([
      "--accent-line",
      "--container-wide",
      "--hero-photo-width",
      "--hero-photo-min-width",
      "--hero-headline-size",
      "--hero-frame-min-ratio",
      "--hero-frame-max-ratio",
      "--radius-dialog",
      "--radius-control",
    ]);
    expect(declaredVars(css("light-editorial"), "light-editorial")).toContain("--accent-line");
    expect(declaredVars(css("dark-premium"), "dark-premium")).not.toContain("--accent-line");
    expect(checkAllThemes().every((t) => t.missing.length === 0)).toBe(true);
  });

  it("--container-wide and --hero-photo-width are optional, used only with fallbacks", () => {
    expect(declaredVars(css("light-editorial"), "light-editorial")).toEqual(expect.arrayContaining(["--container-wide", "--hero-photo-width"]));
    expect(/--hero-photo-width:\s*60%/.test(css("light-editorial"))).toBe(true);
    // dark-premium leaves the photo width out: the 60% fallback of the component applies
    expect(declaredVars(css("dark-premium"), "dark-premium")).not.toContain("--hero-photo-width");
    expect(declaredVars(css("dark-premium"), "dark-premium")).toContain("--container-wide");
    expect(varsWithoutFallback("a { max-width: var(--hero-photo-width); }")).toEqual(["--hero-photo-width"]);
    expect(varsWithoutFallback("a { max-width: var(--container-wide, var(--container)); }")).toEqual([]);
  });

  it("--hero-headline-size is optional, set per theme as a clamp(), and used only with a fallback", () => {
    expect(/--hero-headline-size:\s*clamp\(1\.9rem, 3\.6vw, 3\.25rem\)/.test(css("light-editorial"))).toBe(true);
    expect(/--hero-headline-size:\s*clamp\(2rem, 4vw, 3\.75rem\)/.test(css("dark-premium"))).toBe(true);
    expect(varsWithoutFallback("h1 { font-size: var(--hero-headline-size); }")).toEqual(["--hero-headline-size"]);
    expect(varsWithoutFallback("h1 { font-size: var(--hero-headline-size, 2rem); }")).toEqual([]);
  });

  it("the frame ratio and width floor are optional, set in both themes (max ratio 4 / 3, floor 30%) and used only with fallbacks", () => {
    for (const t of listThemes()) {
      const vars = declaredVars(css(t), t);
      expect(vars, t).toContain("--hero-frame-max-ratio");
      expect(vars, t).toContain("--hero-photo-min-width");
      expect(vars, t).not.toContain("--hero-frame-min-ratio"); // the default 1 applies
      expect(/--hero-frame-max-ratio:\s*4 \/ 3;/.test(css(t)), t).toBe(true);
      expect(/--hero-photo-min-width:\s*30%;/.test(css(t)), t).toBe(true);
    }
    expect(varsWithoutFallback("a { aspect-ratio: var(--hero-frame-min-ratio); }")).toEqual(["--hero-frame-min-ratio"]);
    expect(varsWithoutFallback("a { min-width: var(--hero-photo-min-width); }")).toEqual(["--hero-photo-min-width"]);
    expect(varsWithoutFallback("a { aspect-ratio: var(--hero-frame-max-ratio, 1.7778); }")).toEqual([]);
  });

  it("themes declare no variable that is neither required nor optional", () => {
    for (const t of listThemes()) expect(unknownVars(css(t), t), t).toEqual([]);
    expect(unknownVars(".x{}\n:root[data-theme=\"a\"] { --bg: #000; --typo-var: 1; }", "a")).toEqual(["--typo-var"]);
  });

  it("components use --accent-line only with a fallback", () => {
    expect(varsWithoutFallback("a { color: var(--accent-line); }")).toEqual(["--accent-line"]);
    expect(varsWithoutFallback("a { color: var(--accent-line, var(--accent)); }")).toEqual([]);
    const globals = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
    expect(varsWithoutFallback(globals)).toEqual([]);
    expect(globals).toContain("var(--accent-line, var(--accent))");
  });
});
