// What a build or a snapshot says about itself: the version, the short commit hash of the template repository and of the
// content repository (each with "-dirty" when it has uncommitted changes), and the UTC build time. Only hashes, numbers and a
// date: no names, no paths, no secrets. `npm run snapshot` writes it as version.json; the page and /version.json show it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const git = (cwd, ...args) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

/** "YYYY-MM-DD HH:MM" in UTC. */
export const utcStamp = (now) => `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)}`;

/**
 * The repository `dir` is in: its top folder, the short hash of HEAD and whether the work tree has uncommitted changes
 * (`untracked`: whether new files count). null when `dir` is in no repository or the repository has no commit yet.
 */
function repoState(dir, { untracked }) {
  if (!fs.existsSync(dir)) return null;
  const top = git(dir, "rev-parse", "--show-toplevel");
  const hash = top && git(dir, "rev-parse", "--short", "HEAD");
  if (!top || !hash) return null;
  const changes = git(dir, "status", "--porcelain", untracked ? "--untracked-files=normal" : "--untracked-files=no");
  return { top: fs.realpathSync(top), hash: changes ? `${hash}-dirty` : hash };
}

/**
 * @param {{ projectRoot: string, contentRoot: string, now?: Date }} options
 * @returns {{ version: string | null, template: string | null, content: string | null, built: string }}
 * `template`: HEAD of the template repository ("-dirty" when tracked files differ from it). `content`: HEAD of the git
 * repository the content root is in ("-dirty" when it has uncommitted changes), or null when the content root is in no
 * repository of its own (a content folder inside the template repository is part of the template).
 */
export function buildVersionInfo({ projectRoot, contentRoot, now = new Date() }) {
  let version = null;
  try {
    version = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version ?? null;
  } catch {
    // no package.json: no version
  }
  const template = repoState(projectRoot, { untracked: false });
  const content = repoState(contentRoot, { untracked: true });
  return {
    version,
    template: template ? template.hash : null,
    content: content && content.top !== template?.top ? content.hash : null,
    built: utcStamp(now),
  };
}
