// npm run leads:purge: deletes lead files older than N days. The age comes from the file NAME (UTC stamp), so a dry run
// never opens a file and never prints a name or any data. Dry run unless `write` is true.
import fs from "node:fs";
import path from "node:path";

const FILE_NAME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-[0-9a-f-]{36}\.json$/;

/**
 * @param {{ dir: string, days: number, write?: boolean, now?: Date }} options
 * @returns {{ dir: string, exists: boolean, total: number, old: number, kept: number, ignored: number, deleted: number }}
 */
export function purgeLeads({ dir, days, write = false, now = new Date() }) {
  if (!Number.isInteger(days) || days < 1) throw new Error("--days must be a whole number of at least 1");
  const result = { dir, exists: fs.existsSync(dir), total: 0, old: 0, kept: 0, ignored: 0, deleted: 0 };
  if (!result.exists) return result;
  const cutoff = now.getTime() - days * 86_400_000;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const m = entry.isFile() ? FILE_NAME.exec(entry.name) : null;
    if (!m) {
      result.ignored++; // not a lead file: never touched
      continue;
    }
    result.total++;
    const received = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (received >= cutoff) {
      result.kept++;
      continue;
    }
    result.old++;
    if (write) {
      fs.rmSync(path.join(dir, entry.name));
      result.deleted++;
    }
  }
  return result;
}
