// Dev-only checks, not imported by the app. Runs directly with Node (scripts/check-themes.ts), so keep it self-contained.
import fs from "node:fs";
import path from "node:path";
import { REQUIRED_VARS } from "./themes.ts";

/**
 * Variables used as `var(--x)` without a fallback although `--x` is not a required theme variable.
 * Type and component CSS may use extra variables (for example `--media-ratio`) only with a fallback.
 */
export function varsWithoutFallback(css: string): string[] {
  const required = new Set(REQUIRED_VARS);
  const bad = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) if (!required.has(m[1])) bad.add(m[1]);
  return [...bad];
}

/** Every .css file under `dir` (default: src/). */
export function listCssFiles(dir: string = path.join(process.cwd(), "src")): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCssFiles(p));
    else if (entry.name.endsWith(".css")) out.push(p);
  }
  return out.sort();
}

export function checkCssFallbacks(files: string[] = listCssFiles()): { file: string; vars: string[] }[] {
  return files.map((file) => ({ file, vars: varsWithoutFallback(fs.readFileSync(file, "utf8")) }));
}
