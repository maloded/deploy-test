// Copies the woff2 files each theme needs from the @fontsource dev dependencies into public/fonts/<theme>/.
// Run with `npm run fonts` after changing FONTS. The copied files are committed, so a fresh clone needs no run.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// theme -> [{ pkg, weights }], copied for each subset in SUBSETS: latin (de, en), latin-ext (tr: ğ ş İ) and cyrillic (bg). See "Add a language" in PROJECT.md.
const FONTS = {
  "light-editorial": [
    { pkg: "source-serif-4", weights: [300] },
    { pkg: "source-sans-3", weights: [400, 600] },
  ],
  "dark-premium": [
    { pkg: "cormorant-garamond", weights: [300] },
    { pkg: "inter", weights: [400, 500] },
  ],
};

const SUBSETS = ["latin", "latin-ext", "cyrillic"];

const missing = [];
for (const [theme, families] of Object.entries(FONTS)) {
  const out = path.join(root, "public", "fonts", theme);
  fs.mkdirSync(out, { recursive: true });
  for (const { pkg, weights } of families) {
    for (const weight of weights) {
      for (const subset of SUBSETS) {
        const name = `${pkg}-${subset}-${weight}-normal.woff2`;
        const from = path.join(root, "node_modules", "@fontsource", pkg, "files", name);
        if (!fs.existsSync(from)) {
          missing.push(from);
          continue;
        }
        fs.copyFileSync(from, path.join(out, name));
        console.log(`${theme}: ${name}`);
      }
    }
  }
}

if (missing.length) {
  console.error(`Missing font files:\n${missing.map((m) => `  ${m}`).join("\n")}`);
  process.exit(1);
}
