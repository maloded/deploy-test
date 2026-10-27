import { z } from "zod";
import { formatIssues, languageSchema, localizedSchema, viewingSchema, type Localized } from "./schema";

/**
 * The seller: everything that is the same for all of a seller's products (name, contact, languages, default theme,
 * consent text). One file per seller, <content root>/<seller>/seller.json; the seller slug is the folder name.
 * Unknown values stay obvious placeholders (for example contact@example.invalid); nothing is invented.
 */
const link = z.string().min(1).regex(/^(https?:\/\/|\/|#)/, "must be an http(s) URL, a path starting with /, or an #anchor");

export const sellerContactSchema = z
  .object({
    email: z.email(),
    phone: z.string().min(3).optional(),
    website: z.url().optional(),
  })
  .strict();
export type SellerContact = z.infer<typeof sellerContactSchema>;

export const sellerShape = {
  schemaVersion: z.literal(1),
  /** The brand shown in the header and footer. */
  displayName: z.string().min(1).max(40),
  /** Registered name for the imprint, per language. Optional: no imprint text is invented. */
  legalName: localizedSchema.optional(),
  /** The small legal line in the footer (for example "indicative, not a binding offer"), per language. */
  legalNote: localizedSchema.optional(),
  contact: sellerContactSchema,
  /** Languages the seller's pages are offered in. */
  languages: z.array(languageSchema).min(1),
  /** The page language. It is not implied by the order of `languages`; it must be one of them. */
  defaultLanguage: languageSchema,
  /** The default theme of the seller's products (a product may override it). */
  theme: z.string().min(1),
  /** The seller is the data controller: this is the consent text of the contact form, per language. */
  consentText: localizedSchema,
  /** Optional viewing settings, the default for the seller's products (a product may override single fields). */
  viewing: viewingSchema.optional(),
  /** Placeholders until the seller supplies the real pages. */
  privacyUrl: link.optional(),
  imprintUrl: link.optional(),
};

export const sellerSchema = z.object(sellerShape).strict().superRefine((s, ctx) => {
  if (new Set(s.languages).size !== s.languages.length) {
    ctx.addIssue({ code: "custom", path: ["languages"], message: "each language may appear only once" });
  }
  if (!s.languages.includes(s.defaultLanguage)) {
    ctx.addIssue({ code: "custom", path: ["defaultLanguage"], message: `must be one of languages (${s.languages.join(", ")})` });
  }
});
export type SellerFile = z.infer<typeof sellerSchema>;

export type SellerValidation = { ok: true; seller: SellerFile } | { ok: false; issues: string[] };

/** Validates the parsed content of a seller.json. Returns a flat, human-readable list of problems. */
export function validateSeller(raw: unknown): SellerValidation {
  const parsed = sellerSchema.safeParse(raw);
  return parsed.success ? { ok: true, seller: parsed.data } : { ok: false, issues: formatIssues(parsed.error) };
}

/**
 * Plain-data descriptors of the seller fields (like the product type descriptors): an admin form or a voice agent can
 * read them. A test keeps them in step with the schema.
 */
export type SellerFieldDescriptor = {
  key: keyof typeof sellerShape;
  label: Localized;
  required: boolean;
  type: "version" | "text" | "localized" | "contact" | "languages" | "language" | "theme" | "link" | "viewing";
};

export const SELLER_FIELDS = [
  { key: "schemaVersion", label: { en: "Schema version", de: "Schemaversion" }, required: true, type: "version" },
  { key: "displayName", label: { en: "Brand shown on the page", de: "Marke auf der Seite" }, required: true, type: "text" },
  { key: "legalName", label: { en: "Legal name", de: "Rechtlicher Name" }, required: false, type: "localized" },
  { key: "legalNote", label: { en: "Legal note in the footer", de: "Rechtlicher Hinweis in der Fußzeile" }, required: false, type: "localized" },
  { key: "contact", label: { en: "Contact (email, phone, website)", de: "Kontakt (E-Mail, Telefon, Website)" }, required: true, type: "contact" },
  { key: "languages", label: { en: "Languages", de: "Sprachen" }, required: true, type: "languages" },
  { key: "defaultLanguage", label: { en: "Default language", de: "Standardsprache" }, required: true, type: "language" },
  { key: "theme", label: { en: "Default theme", de: "Standard-Theme" }, required: true, type: "theme" },
  { key: "consentText", label: { en: "Consent text of the contact form", de: "Einwilligungstext des Kontaktformulars" }, required: true, type: "localized" },
  { key: "viewing", label: { en: "Viewing settings (default)", de: "Besichtigungseinstellungen (Standard)" }, required: false, type: "viewing" },
  { key: "privacyUrl", label: { en: "Privacy page (placeholder)", de: "Datenschutzseite (Platzhalter)" }, required: false, type: "link" },
  { key: "imprintUrl", label: { en: "Imprint page (placeholder)", de: "Impressum (Platzhalter)" }, required: false, type: "link" },
] as const satisfies readonly SellerFieldDescriptor[];
