// Self-contained on purpose: scripts/check-themes.ts runs this file directly with Node.
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_THEME = "light-editorial";

export const REQUIRED_VARS = [
  "--bg",
  "--surface",
  "--text",
  "--muted",
  "--accent",
  "--accent-contrast",
  "--border",
  "--radius",
  "--font-heading",
  "--font-body",
  "--base-size",
  "--line-height",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-7",
  "--container",
];

/**
 * Optional theme variables. A theme may leave them out; components always use them with a fallback,
 * for example var(--accent-line, var(--accent)).
 */
export const OPTIONAL_VARS = [
  "--accent-line",
  "--container-wide",
  "--hero-photo-width",
  "--hero-photo-min-width",
  "--hero-headline-size",
  "--hero-frame-min-ratio",
  "--hero-frame-max-ratio",
  "--radius-dialog",
  "--radius-control",
];

export const THEMES_DIR = path.join(process.cwd(), "public", "themes");

export function listThemes(dir: string = THEMES_DIR): string[] {
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => f.slice(0, -4))
    .sort();
}

/** Variables declared inside `:root[data-theme="<name>"] { ... }`. */
export function declaredVars(css: string, name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`:root\\[data-theme=["']${escaped}["']\\]\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) return [];
  return [...block[1].matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]);
}

/** Required variables that the theme CSS does not define. A missing :root block reports all of them. */
export function missingVars(css: string, name: string): string[] {
  const have = new Set(declaredVars(css, name));
  return REQUIRED_VARS.filter((v) => !have.has(v));
}

/** Variables declared in the theme block that are neither required nor optional (probably a typo). */
export function unknownVars(css: string, name: string): string[] {
  const known = new Set([...REQUIRED_VARS, ...OPTIONAL_VARS]);
  return declaredVars(css, name).filter((v) => !known.has(v));
}

export function checkAllThemes(dir: string = THEMES_DIR): { theme: string; missing: string[] }[] {
  return listThemes(dir).map((theme) => ({
    theme,
    missing: missingVars(fs.readFileSync(path.join(dir, `${theme}.css`), "utf8"), theme),
  }));
}

/**
 * Picks the theme to render. Unknown name: a clear error in development,
 * a warning plus the default theme in production.
 */
export function resolveTheme(
  requested: string,
  opts: { available: string[]; isDev: boolean },
): { theme: string; warning?: string } {
  if (opts.available.includes(requested)) return { theme: requested };
  const message = `Unknown theme "${requested}". Available themes: ${opts.available.join(", ") || "(none)"}.`;
  if (opts.isDev) throw new Error(message);
  return { theme: DEFAULT_THEME, warning: `${message} Falling back to "${DEFAULT_THEME}".` };
}
