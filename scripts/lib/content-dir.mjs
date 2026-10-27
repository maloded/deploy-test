// The content root for scripts (CONTENT_DIR, default ./content): a clear message and exit code 1 instead of a stack trace.
import { contentRoot } from "../../src/lib/content-root.ts";

export function contentRootOrExit() {
  try {
    return contentRoot();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
