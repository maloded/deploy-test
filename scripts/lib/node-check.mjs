// Plain JavaScript on purpose: it runs before any TypeScript file is loaded, so it can explain what is wrong.
// The scripts import a few .ts files (content-root.ts, themes.ts); Node runs those only when it strips types, which
// it does by default from 22.18 (earlier 22.x and 20.x need --experimental-strip-types or cannot do it at all).

/**
 * @param {{ typescript?: boolean | string }} [features] process.features
 * @param {string} [version] process.version
 * @returns {string | null} an error message, or null when scripts can run
 */
export function nodeProblem(features = process.features, version = process.version) {
  if (features.typescript) return null; // "strip" or "transform"
  return (
    `This script needs a Node.js that runs TypeScript files by stripping types (Node 22.18 or newer, or 24). ` +
    `You have Node ${version}. Use Node 22.x or 24.x (package.json "engines"), or run it with --experimental-strip-types on Node 22.6 to 22.17.`
  );
}
