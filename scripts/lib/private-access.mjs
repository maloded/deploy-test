import fs from "node:fs";
import path from "node:path";

/** The one file under src/ that may reach into the widget's internals. */
export const BRIDGE_FILE = "src/lib/hanc-bridge.ts";
/**
 * Names of hanc-webrtc-widgets internals (pinned to one version). `.room` is the property access; the plain word "room" in prose
 * is fine. src/lib/hanc-bridge.ts is the only file that may use them.
 */
export const PRIVATE_WIDGET_NAMES = /\bcallManager\b|lk\.agent\.state|participantAttributesChanged|\.room\b|\.remoteParticipants\b/;

const posix = (p) => p.split(path.sep).join("/");
const SOURCE = /\.(ts|tsx|mts|js|mjs|jsx|css)$/;

/** Files under src/ (other than the bridge) that use a private widget name: [{ file, line, text }]. */
export function privateAccessProblems(projectRoot) {
  const problems = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (SOURCE.test(entry.name)) {
        const rel = posix(path.relative(projectRoot, abs));
        if (rel === BRIDGE_FILE) continue;
        fs.readFileSync(abs, "utf8")
          .split("\n")
          .forEach((text, i) => {
            if (PRIVATE_WIDGET_NAMES.test(text)) problems.push({ file: rel, line: i + 1, text: text.trim().slice(0, 100) });
          });
      }
    }
  };
  const src = path.join(projectRoot, "src");
  if (fs.existsSync(src)) walk(src);
  return problems;
}
