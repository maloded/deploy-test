// Plain Node scripts and Vitest do not read .env.local (Next.js does). This loads it into process.env:
// real environment variables win over the file, nothing is printed, and a missing file is fine.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * @param {string} [dir] the project root (default: the current directory)
 * @param {Record<string, string | undefined>} [env] the environment to fill (default: process.env)
 * @returns {string[]} the NAMES that were set from the file (never the values)
 */
export function loadEnvLocal(dir = process.cwd(), env = process.env) {
  const file = path.join(dir, ".env.local");
  if (!fs.existsSync(file)) return [];
  const set = [];
  for (const [name, value] of Object.entries(parseEnv(fs.readFileSync(file, "utf8")))) {
    if (env[name] === undefined) {
      env[name] = value;
      set.push(name);
    }
  }
  return set;
}
