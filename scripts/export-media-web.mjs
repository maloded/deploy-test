// npm run images:export (see scripts/lib/export-media-web.mjs)
import { contentRootOrExit } from "./lib/content-dir.mjs";
import { ExportError, exportMediaWeb } from "./lib/export-media-web.mjs";

try {
  const report = await exportMediaWeb({ contentDir: contentRootOrExit(), log: console.log });
  const files = report.flatMap((r) => r.exported);
  const mb = files.reduce((a, f) => a + f.bytes, 0) / 1048576;
  console.log(`exported ${files.length} file(s), ${mb.toFixed(2)} MB; skipped (not used): ${report.reduce((a, r) => a + r.skipped.length, 0)}`);
} catch (e) {
  if (e instanceof ExportError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
