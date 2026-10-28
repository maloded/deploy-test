// Self-contained like lead-context.ts (next.config.ts imports it): reads the version.json that `npm run snapshot` writes in
// the snapshot's root, and hands it to the build as the VERSION_INFO variable, so the pages stay static. The working
// repository has no version.json: the page then says "dev". The file holds only a version number, two short commit
// hashes and a UTC time; every field is checked against its shape and dropped if it does not match.
import fs from "node:fs";
import path from "node:path";

export type VersionInfo = { version: string | null; template: string | null; content: string | null; built: string | null };

const SHAPES: Record<keyof VersionInfo, RegExp> = {
  version: /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/,
  template: /^[0-9a-f]{4,40}(-dirty)?$/,
  content: /^[0-9a-f]{4,40}(-dirty)?$/,
  built: /^\d{4}-\d\d-\d\d \d\d:\d\d$/,
};

/** Keeps only the four known fields, each only if it has the expected shape; null when nothing is left. */
export function cleanVersionInfo(raw: unknown): VersionInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out = {} as VersionInfo;
  for (const key of Object.keys(SHAPES) as (keyof VersionInfo)[]) {
    const value = (raw as Record<string, unknown>)[key];
    out[key] = typeof value === "string" && SHAPES[key].test(value) ? value : null;
  }
  return Object.values(out).some(Boolean) ? out : null;
}

type Env = Record<string, string | undefined>;

/** { VERSION_INFO: "<json>" } for next.config.ts, or {} when there is no (readable) version.json. */
export function versionEnv(projectRoot: string = process.cwd()): Record<string, string> {
  try {
    const info = cleanVersionInfo(JSON.parse(fs.readFileSync(path.join(projectRoot, "version.json"), "utf8")));
    return info ? { VERSION_INFO: JSON.stringify(info) } : {};
  } catch {
    return {};
  }
}

/**
 * The inlined version info, or null in the working repository. The literal `process.env.VERSION_INFO` is what the build
 * replaces with the value from next.config.ts (reading it through a variable such as `env.X` would not be replaced).
 */
export function currentVersion(env?: Env): VersionInfo | null {
  const raw = env ? env.VERSION_INFO : process.env.VERSION_INFO;
  try {
    return raw ? cleanVersionInfo(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** "v0.2.0 · template 9328a8e · content 4b59167 · 2026-10-28 14:10 UTC", or "dev". Labels are not translated. */
export function versionLine(info: VersionInfo | null): string {
  if (!info) return "dev";
  const parts = [info.version && `v${info.version}`, info.template && `template ${info.template}`, info.content && `content ${info.content}`, info.built && `${info.built} UTC`];
  return parts.filter(Boolean).join(" · ") || "dev";
}
