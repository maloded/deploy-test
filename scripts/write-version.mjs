// Writes version.json (the same fields as a snapshot's: version, template commit, content commit, build time) for a build that has no git
// history to read, which is the case in the Docker image (.dockerignore keeps .git out of the build context). The version is the one in
// package.json and the time is now (UTC). The commits come from TEMPLATE_COMMIT and CONTENT_COMMIT (Docker build arguments) when they are
// given and look like a commit hash; otherwise from git when the folders are repositories; otherwise they stay out of the file (the page then
// shows what is known: a release build shows only the version anyway). An existing version.json (a snapshot's own) is never overwritten.
// Only hashes, a number and a date: no names, no paths, no secrets.
import fs from "node:fs";
import path from "node:path";
import { buildVersionInfo } from "./lib/version-info.mjs";

const HASH = /^[0-9a-f]{4,40}$/i;
const short = (value) => (typeof value === "string" && HASH.test(value.trim()) ? value.trim().toLowerCase().slice(0, 7) : null);

/**
 * The info to write: git's answer, with the commits from the environment taking precedence.
 * @param {{ projectRoot: string, contentRoot: string, env?: Record<string, string | undefined>, now?: Date }} options
 */
export function versionToWrite({ projectRoot, contentRoot, env = process.env, now = new Date() }) {
  const info = buildVersionInfo({ projectRoot, contentRoot, now });
  return { ...info, template: short(env.TEMPLATE_COMMIT) ?? info.template, content: short(env.CONTENT_COMMIT) ?? info.content };
}

/**
 * Writes <projectRoot>/version.json unless it exists; returns what it did.
 * @param {{ projectRoot?: string, env?: Record<string, string | undefined>, now?: Date }} [options]
 */
export function writeVersion({ projectRoot = process.cwd(), env = process.env, now = new Date() } = {}) {
  const file = path.join(projectRoot, "version.json");
  if (fs.existsSync(file)) return { written: false, file };
  const contentRoot = path.resolve(projectRoot, env.CONTENT_DIR || "content");
  const info = versionToWrite({ projectRoot, contentRoot, env, now });
  fs.writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
  return { written: true, file, info };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = writeVersion();
  console.log(result.written ? `version.json written (v${result.info.version ?? "?"})` : "version.json exists: left as it is");
}
