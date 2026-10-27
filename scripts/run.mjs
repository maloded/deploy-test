// Launcher for the scripts that import TypeScript files: node scripts/run.mjs <script> [args...]
// Checks the Node version first (a clear message instead of ERR_UNKNOWN_FILE_EXTENSION), then runs the script.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
import { nodeProblem } from "./lib/node-check.mjs";

const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/run.mjs <script> [args...]");
  process.exit(1);
}
const problem = nodeProblem();
if (problem) {
  console.error(problem);
  process.exit(1);
}
loadEnvLocal(); // CONTENT_DIR and friends from .env.local, like Next.js; real environment variables win
process.argv = [process.argv[0], path.resolve(script), ...rest]; // the script sees its own path and arguments
await import(pathToFileURL(path.resolve(script)).href);
