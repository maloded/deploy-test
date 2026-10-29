// npm run check:template-clean
// Also fails when a file under src/ other than src/lib/hanc-bridge.ts uses the widget's internals (scripts/lib/private-access.mjs).
// Fails when this working tree or its git index still holds a seller's data (a seller folder outside examples/ and
// tests/fixtures). Run it by hand before a template release. It is NOT part of npm test, the build or CI: it is
// expected to fail until the content has been moved out (docs/MOVE-CONTENT.md).
import { privateAccessProblems, BRIDGE_FILE } from "./lib/private-access.mjs";
import { templateCleanProblems } from "./lib/template-clean.mjs";

const problems = templateCleanProblems(process.cwd());
const access = privateAccessProblems(process.cwd());
if (access.length > 0) {
  console.error(`The widget's internals may only be used in ${BRIDGE_FILE}. Found elsewhere:`);
  for (const a of access) console.error(`  ${a.file}:${a.line}: ${a.text}`);
  process.exit(1);
}
if (problems.length === 0) {
  console.log("template is clean: no seller folder outside examples/ and tests/fixtures (working tree and index).");
} else {
  console.error("template is NOT clean. Seller data found:");
  for (const p of problems) console.error(`  ${p.where}: ${p.folder}`);
  console.error("Move it out first: docs/MOVE-CONTENT.md");
  process.exit(1);
}
