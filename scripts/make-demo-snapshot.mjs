// npm run snapshot -- --product <seller>/<product> --out <folder> [--replace | --update] [--trailer "Name: value"]
// See scripts/lib/snapshot.mjs: one product, a whitelist, one commit "Demo snapshot" (--update: one more commit
// "Update: ..." on an existing deploy repository), no remote, no push.
import path from "node:path";
import { contentRootOrExit } from "./lib/content-dir.mjs";
import { createSnapshot, updateSnapshot } from "./lib/snapshot.mjs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const projectRoot = process.cwd();

const out = arg("--out");
if (!out) {
  console.error("Pass --out <folder>: where to write the snapshot (a new folder outside this repository).");
  process.exit(1);
}

if (args.includes("--update") && args.includes("--replace")) {
  console.error("Use either --update (a new commit on the existing deploy repository) or --replace (rebuild it), not both.");
  process.exit(1);
}

try {
  if (args.includes("--update")) {
    const r = await updateSnapshot({ projectRoot, contentRoot: contentRootOrExit(), product: arg("--product"), dest: path.resolve(out), log: console.log });
    console.log(`\nchanged paths: ${r.changed.length}`);
    for (const p of r.changed) console.log(`   ${p}`);
    console.log(`template paths changed (outside content/): ${r.templateChanged.length}${r.templateChanged.length ? " <- template files differ from the last snapshot" : ""}`);
    for (const p of r.templateChanged) console.log(`   ${p}`);
    if (r.commit) console.log(`\nCreated one commit on top of the existing history (${r.commit}).`);
    else console.log("\nNothing changed: no commit was made.");
    console.log("No remote was added and nothing was pushed. To publish it, run:");
    console.log(`   ${r.pushCommand}`);
    process.exit(0);
  }
  const result = await createSnapshot({
    projectRoot,
    contentRoot: contentRootOrExit(), // CONTENT_DIR, default ./content
    product: arg("--product"),
    dest: path.resolve(out),
    replace: args.includes("--replace"),
    trailer: arg("--trailer"),
    log: console.log,
  });
  console.log(`\nCreated ${result.dest}: one commit "Demo snapshot" (${result.commit}).`);
  console.log("No remote was added and nothing was pushed.");
} catch (e) {
  console.error(e.message); // a refusal, an export error or a bad argument: a message, no stack trace
  process.exit(1);
}
