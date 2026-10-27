// npm run check:languages: translation coverage per product (warnings only; it exits 1 only when a product cannot be loaded).
import { contentRootOrExit } from "./lib/content-dir.mjs";
import { languageReport } from "./lib/language-report.mjs";

try {
  const { lines, warnings } = languageReport(contentRootOrExit());
  console.log("translation coverage (localized fields with a text / all localized fields):");
  for (const l of lines) console.log("  " + l);
  for (const w of warnings) console.warn("  WARNING " + w);
  console.log(warnings.length ? `${warnings.length} missing translation(s): the default language is shown instead.` : "no missing translations.");
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
