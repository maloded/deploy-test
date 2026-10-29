// npm run images:export (see scripts/lib/export-media-web.mjs)
import { contentRootOrExit } from "./lib/content-dir.mjs";
import { AvatarError, reportAvatars } from "./lib/avatars.mjs";
import { ExportError, exportMediaWeb } from "./lib/export-media-web.mjs";

try {
  const report = await exportMediaWeb({ contentDir: contentRootOrExit(), log: console.log });
  const files = report.flatMap((r) => r.exported);
  const mb = files.reduce((a, f) => a + f.bytes, 0) / 1048576;
  const avatars = await reportAvatars(contentRootOrExit());
  for (const a of avatars.used) console.log(`avatar ${a.id}: ${a.files.length} file(s), ${(a.files.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(2)} MB (copied as they are, nothing to process)`);
  for (const id of avatars.skipped) console.log(`avatar ${id}: skipped (not used)`);
  console.log(`exported ${files.length} file(s), ${mb.toFixed(2)} MB; skipped (not used): ${report.reduce((a, r) => a + r.skipped.length, 0)}`);
} catch (e) {
  if (e instanceof ExportError || e instanceof AvatarError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
