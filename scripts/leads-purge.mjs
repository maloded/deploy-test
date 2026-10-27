// npm run leads:purge [-- --days N] [--write]
// Deletes lead files (LEADS_DIR, default ./data/leads) older than N days (default 90). A dry run unless --write is given.
import path from "node:path";
import { purgeLeads } from "./lib/leads-purge.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const at = args.indexOf("--days");
const days = at >= 0 ? Number(args[at + 1]) : 90;
const unknown = args.filter((a, i) => !["--write", "--days"].includes(a) && args[i - 1] !== "--days");
if (unknown.length) {
  console.error("Usage: npm run leads:purge [-- --days N] [--write]");
  process.exit(1);
}
const dir = path.resolve(process.env.LEADS_DIR?.trim() || "data/leads");
try {
  const r = purgeLeads({ dir, days, write });
  if (!r.exists) console.log(`Nothing to purge: ${dir} does not exist.`);
  else {
    console.log(`${dir}: ${r.total} lead file(s), ${r.old} older than ${days} day(s), ${r.kept} kept${r.ignored ? `, ${r.ignored} other entries left alone` : ""}.`);
    console.log(write ? `Deleted ${r.deleted} file(s).` : r.old ? "Dry run: nothing was deleted. Run again with --write to delete them." : "Dry run: nothing to delete.");
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
