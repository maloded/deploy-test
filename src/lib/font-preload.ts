import fs from "node:fs";
import path from "node:path";
import { languageEntry, type Language } from "./languages";
import { THEMES_DIR } from "./themes";

/**
 * The font files to preload for a page: the theme's heading and body fonts (the first family of --font-heading and --font-body, every weight the theme declares),
 * in the subsets the page's language needs (languages.ts). They are read from the theme's own @font-face rules, so a theme needs nothing extra. The hero's text is in these
 * fonts; asked for in the head, they arrive with the stylesheet instead of after the first layout, and the first paint is already in the real font (or a metric-matched stand-in).
 */
export function fontPreloads(theme: string, lang: Language, dir: string = THEMES_DIR): string[] {
  let css: string;
  try {
    css = fs.readFileSync(path.join(dir, `${theme}.css`), "utf8");
  } catch {
    return [];
  }
  const first = (variable: string) => new RegExp(`${variable}:\\s*"([^"]+)"`).exec(css)?.[1];
  const families = new Set([first("--font-heading"), first("--font-body")].filter((f): f is string => Boolean(f)));
  const subsets = new Set<string>(languageEntry(lang).fontSubsets);
  const out: string[] = [];
  for (const rule of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = rule[1];
    const family = new RegExp(`${"font-family"}\\s*:\\s*"([^"]+)"`).exec(body)?.[1];
    const url = /url\("([^"]+\.woff2)"\)/.exec(body)?.[1];
    const subset = url && /-(latin-ext|latin|cyrillic)-\d+-normal\.woff2$/.exec(url)?.[1];
    if (family && url && subset && families.has(family) && subsets.has(subset) && !out.includes(url)) out.push(url);
  }
  return out;
}
