// npm run export:template -- --out <new folder outside this repository>
// See scripts/lib/template-export.mjs: the template alone, one commit "Template export", no remote, no push.
import path from "node:path";
import { exportTemplate } from "./lib/template-export.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--out");
const out = i >= 0 ? args[i + 1] : undefined;
if (!out) {
  console.error("Pass --out <folder>: where to write the template export (a new folder outside this repository).");
  process.exit(1);
}

try {
  const result = await exportTemplate({ projectRoot: process.cwd(), dest: path.resolve(out), log: console.log });
  console.log(`\nCreated ${result.dest}: one commit "Template export" (${result.commit}).`);
  console.log("No remote was added and nothing was pushed.");
  if (result.warnings.length) console.log(`${result.warnings.length} warning(s) above: review those lines of the notes before you push.`);
} catch (e) {
  console.error(e.message); // a refusal or a bad argument: a message, no stack trace
  process.exit(1);
}
