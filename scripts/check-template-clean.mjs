// npm run check:template-clean
// Fails when this working tree or its git index still holds a seller's data (a seller folder outside examples/ and
// tests/fixtures). Run it by hand before a template release. It is NOT part of npm test, the build or CI: it is
// expected to fail until the content has been moved out (docs/MOVE-CONTENT.md).
import { templateCleanProblems } from "./lib/template-clean.mjs";

const problems = templateCleanProblems(process.cwd());
if (problems.length === 0) {
  console.log("template is clean: no seller folder outside examples/ and tests/fixtures (working tree and index).");
} else {
  console.error("template is NOT clean. Seller data found:");
  for (const p of problems) console.error(`  ${p.where}: ${p.folder}`);
  console.error("Move it out first: docs/MOVE-CONTENT.md");
  process.exit(1);
}
