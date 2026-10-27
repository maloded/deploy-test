// Dev check: every public/themes/*.css must define every required variable. Run: npm run check:themes
import path from "node:path";
import { checkThemeContrast } from "../src/lib/contrast.ts";
import { checkCssFallbacks } from "../src/lib/theme-check.ts";
import fs from "node:fs";
import { checkAllThemes, REQUIRED_VARS } from "../src/lib/themes.ts";

const results = checkAllThemes();
let failed = false;
for (const { theme, missing } of results) {
  if (missing.length) {
    failed = true;
    console.error(`FAIL ${theme}: missing ${missing.join(", ")}`);
  } else {
    console.log(`ok   ${theme} (${REQUIRED_VARS.length} variables)`);
  }
}
if (!results.length) {
  console.error("FAIL: no theme files found in public/themes");
  failed = true;
}

// Contrast (WCAG): text pairs need 4.5:1.
for (const { theme } of results) {
  const css = fs.readFileSync(path.join(process.cwd(), "public", "themes", `${theme}.css`), "utf8");
  for (const r of checkThemeContrast(css, theme)) {
    if (!r.ok) failed = true;
    console.log(`${r.ok ? "ok  " : "FAIL"} ${theme}: ${r.name} ${r.ratio.toFixed(2)}:1 (min ${r.min})`);
  }
}

// Type and component CSS: any variable that is not a required theme variable needs a fallback.
for (const { file, vars } of checkCssFallbacks()) {
  const name = path.relative(process.cwd(), file);
  if (vars.length) {
    failed = true;
    console.error(`FAIL ${name}: no fallback for ${vars.join(", ")}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

process.exit(failed ? 1 : 0);
