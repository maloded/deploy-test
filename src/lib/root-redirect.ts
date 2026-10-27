// Self-contained like content-root.ts (next.config.ts imports it): where "/" goes (the proxy redirects it, see proxy.ts).
import fs from "node:fs";
import path from "node:path";
import { contentProduct, contentRoot, splitRef } from "./content-root.ts";
import { isLanguage, LANGUAGES, type Language } from "./languages.ts";

type Env = Record<string, string | undefined>;

/** The default language of the seller of the served product (seller.json "defaultLanguage"). Throws a message when it cannot be read. */
export function siteDefaultLanguage(env: Env = process.env, projectRoot: string = process.cwd()): Language {
  const root = contentRoot(env, projectRoot);
  const { seller } = splitRef(contentProduct(env, root));
  const file = path.join(root, seller, "seller.json");
  const value = (JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { defaultLanguage?: unknown }).defaultLanguage;
  if (!isLanguage(value)) throw new Error(`${seller}/seller.json: defaultLanguage ${JSON.stringify(value)} is not a supported language (${LANGUAGES.join(", ")}).`);
  return value;
}

/**
 * The value next.config.ts hands to the proxy as SITE_DEFAULT_LANGUAGE (the config `env` option inlines it at build time,
 * so the proxy needs no file access on the host). Empty when the content cannot be read here: the build or the page load
 * then reports the problem with its own message, and "/" is simply not redirected.
 */
export function rootRedirectEnv(env: Env = process.env, projectRoot: string = process.cwd()): Record<string, string> {
  try {
    return { SITE_DEFAULT_LANGUAGE: siteDefaultLanguage(env, projectRoot) };
  } catch {
    return {};
  }
}
