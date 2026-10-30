import fs from "node:fs";
import path from "node:path";
import { THEMES_DIR } from "./themes";

/**
 * The browser's theme-color (the colour of the address bar on a phone) is the theme's own page background: its `--bg` token, read from
 * public/themes/<theme>.css, as a plain hex colour. null when the theme or the token is missing or not a plain hex value (a gradient or var()):
 * then there is no theme-color, nothing is guessed.
 */
export function themeColor(theme: string, dir: string = THEMES_DIR): string | null {
  try {
    const css = fs.readFileSync(/*turbopackIgnore: true*/ path.join(dir, `${theme}.css`), "utf8");
    const escaped = theme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = new RegExp(`:root\\[data-theme=["']${escaped}["']\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    const value = /(?:^|[\s;{])--bg\s*:\s*([^;]+);/.exec(block)?.[1].trim() ?? "";
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}
