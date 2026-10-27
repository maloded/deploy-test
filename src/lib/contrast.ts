// Dev-only (not imported by the app); runs directly with Node from scripts/check-themes.ts.
import { declaredVars } from "./themes.ts";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex color: "${hex}"`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.x contrast ratio between two #rrggbb colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastPair = { name: string; fg: string; bg: string; min: number };

/** Pairs a theme must satisfy. Text on its backgrounds needs 4.5; the accent is used as small text and as a fill. */
export const PAIRS: { name: string; fg: string; bg: string; min: number; optional?: boolean }[] = [
  { name: "text on bg", fg: "--text", bg: "--bg", min: 4.5 },
  { name: "text on surface", fg: "--text", bg: "--surface", min: 4.5 },
  { name: "muted on bg", fg: "--muted", bg: "--bg", min: 4.5 },
  { name: "muted on surface", fg: "--muted", bg: "--surface", min: 4.5 },
  { name: "accent on bg", fg: "--accent", bg: "--bg", min: 4.5 },
  { name: "accent on surface", fg: "--accent", bg: "--surface", min: 4.5 },
  { name: "button text on accent", fg: "--accent-contrast", bg: "--accent", min: 4.5 },
  // optional variable, for icons and hairlines (non-text contrast: 3:1); checked only when the theme sets it
  { name: "accent-line on bg", fg: "--accent-line", bg: "--bg", min: 3, optional: true },
  { name: "accent-line on surface", fg: "--accent-line", bg: "--surface", min: 3, optional: true },
];

export function themeVarValues(css: string, name: string): Record<string, string> {
  const block = new RegExp(`:root\\[data-theme=["']${name}["']\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const v of declaredVars(css, name)) {
    out[v] = new RegExp(`${v}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim() ?? "";
  }
  return out;
}

export function checkThemeContrast(css: string, name: string): { name: string; ratio: number; min: number; ok: boolean }[] {
  const vars = themeVarValues(css, name);
  return PAIRS.filter((p) => !p.optional || vars[p.fg]).map((p) => {
    const ratio = contrastRatio(vars[p.fg], vars[p.bg]);
    return { name: p.name, ratio, min: p.min, ok: ratio >= p.min };
  });
}
