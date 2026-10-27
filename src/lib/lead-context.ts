// Self-contained like content-root.ts (next.config.ts imports it): what the lead API must know about the site without
// reading files at run time: the product reference, the languages, and the SHA-256 of the consent text of each language.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { contentProduct, contentRoot } from "./content-root.ts";
import { fields as bag } from "../product-types/bag/fields.ts";
import { fields as base } from "../product-types/_base/fields.ts";
import { fields as car } from "../product-types/car/fields.ts";
import { fields as house } from "../product-types/house/fields.ts";
import { fields as watch } from "../product-types/watch/fields.ts";
import { isLanguage, type Language } from "./languages.ts";
import { allowedRequestTypes, type RequestType } from "./request-types.ts";
import { checkViewing, mergeViewing, missingViewingFields, type ViewingConfig, type ViewingSettings } from "./viewing.ts";

/** requestTypes of each product type (the same plain data the app reads; type-only imports, so plain Node can load them). */
const REQUEST_TYPES_OF: Record<string, readonly RequestType[]> = { car: car.requestTypes, house: house.requestTypes, watch: watch.requestTypes, bag: bag.requestTypes, other: base.requestTypes };

type Env = Record<string, string | undefined>;

export type LeadContext = {
  /** "<seller>/<product>" */
  product: string;
  languages: Language[];
  /** The request types this product accepts (its product type's list, without those that need viewing settings the product lacks). */
  requestTypes: RequestType[];
  /** The merged viewing settings the slots are checked against; null when the product has none. */
  viewing: ViewingConfig | null;
  /** Language -> SHA-256 (hex) of the consent text shown in that language (a missing translation shows the default's). */
  consent: Record<string, string>;
};

/** SHA-256 of a text, hex. */
export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** Reads seller.json and builds the context. Throws a message when something is missing or unsupported. */
export function readLeadContext(env: Env = process.env, projectRoot: string = process.cwd()): LeadContext {
  const root = contentRoot(env, projectRoot);
  const product = contentProduct(env, root);
  const seller = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ path.join(root, product.split("/")[0], "seller.json"), "utf8")) as {
    languages?: unknown[];
    defaultLanguage?: unknown;
    consentText?: Record<string, string>;
    viewing?: ViewingSettings;
  };
  const languages = (seller.languages ?? []).filter(isLanguage);
  const fallback = isLanguage(seller.defaultLanguage) ? seller.consentText?.[seller.defaultLanguage] : undefined;
  const consent: Record<string, string> = {};
  for (const lang of languages) {
    const text = seller.consentText?.[lang] ?? fallback;
    if (!text) throw new Error(`seller.json has no consent text for "${lang}"`);
    consent[lang] = sha256(text);
  }
  if (languages.length === 0) throw new Error("seller.json offers no supported language");
  const productFile = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ path.join(root, product, "product.json"), "utf8")) as { productType?: string; viewing?: ViewingSettings };
  const merged = mergeViewing(seller.viewing, productFile.viewing);
  // (the loader refuses an incomplete or invalid merge when the page is built; here it simply means "no viewing")
  const viewing = merged && missingViewingFields(merged).length === 0 && checkViewing(merged).length === 0 ? (merged as ViewingConfig) : null;
  const listed = REQUEST_TYPES_OF[productFile.productType ?? ""];
  if (!listed) throw new Error(`unknown product type "${productFile.productType}"`);
  return { product, languages, requestTypes: allowedRequestTypes(listed, viewing !== null), viewing, consent };
}

/** The value next.config.ts inlines as LEAD_CONTEXT; empty when the content cannot be read here. */
export function leadContextEnv(env: Env = process.env, projectRoot: string = process.cwd()): Record<string, string> {
  try {
    return { LEAD_CONTEXT: JSON.stringify(readLeadContext(env, projectRoot)) };
  } catch {
    return {};
  }
}

/**
 * The context for a request: the inlined LEAD_CONTEXT (so a host needs no file access), else read from the content
 * (development and tests). null when neither works: the API then answers 503 and the form shows the e-mail link.
 */
export function leadContext(env: Env = process.env): LeadContext | null {
  try {
    const inlined = env.LEAD_CONTEXT;
    if (inlined) return JSON.parse(inlined) as LeadContext;
    return readLeadContext(env);
  } catch {
    return null;
  }
}
