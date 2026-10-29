import { z } from "zod";
import { AVATAR_ID } from "./avatar-manifest";
import { contactWindowsSchema, formatIssues, languageSchema, localizedSchema, viewingSchema, type Localized } from "./schema";
import { isTimeZone } from "./viewing";

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

/**
 * The voice assistant widget (a public embed identifier, no secret). The widget element is mounted only when the seller
 * has this object. `id` is the agent's embed id, so it belongs in the seller's own content folder, never in this repository.
 */
export const AGENT_VARIANTS = ["inline", "pill", "floating"] as const;
export const AGENT_PLACEMENTS = ["header", "top", "bottom"] as const;
export const DEFAULT_VOICE_SERVICE_URL = "https://voice.hanc.ai";
export const sellerAgentSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, "letters, digits, - and _ only"),
    /**
     * "inline": the large orb widget. "pill": the compact pill (orb and button in one row). "floating": a pill fixed in a corner,
     * no strip. Left out: "pill" with placement "top" or "header", "inline" otherwise.
     */
    variant: z.enum(AGENT_VARIANTS).optional(),
    /**
     * Where the assistant is: "bottom" the strip above the footer (default), "top" a slim strip right below the header, or
     * "header" in the header itself (the pill, in place of the header's button; "inline" there behaves as "bottom").
     * "floating" ignores it.
     */
    placement: z.enum(AGENT_PLACEMENTS).default("bottom"),
    /** The widget's own theme name (optional; its default theme otherwise). */
    theme: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
    /**
     * Optional avatar card, chosen from the shared library (<content root>/_avatars/<id>) by id. The id is the only link: no file
     * name belongs here. With an avatar the assistant is the fixed card in the bottom-right corner and `variant` and `placement`
     * are ignored. `name` replaces the pack's name as the card's accessible name and its caption's heading. `tagline` (one line) and
     * `badge` (a small marker such as "AI assistant") make the caption over the foot of the card; with neither there is no caption.
     */
    avatar: z
      .object({
        id: z.string().regex(AVATAR_ID, "lowercase letters, digits and dashes only").max(60),
        name: z.string().trim().min(1).max(60).optional(),
        tagline: localizedSchema.optional(),
        badge: localizedSchema.optional(),
        /** The start button's and the end button's labels (default: the standard "Start call" / "End call" of the page language). */
        startLabel: localizedSchema.optional(),
        endLabel: localizedSchema.optional(),
        /** The icon in the start button: the status "dot" (default) or a car "wheel" that turns while the agent speaks. */
        buttonIcon: z.enum(["dot", "wheel"]).default("dot"),
      })
      .strict()
      .optional(),
    voiceServiceUrl: z.url({ protocol: /^https$/ }).default(DEFAULT_VOICE_SERVICE_URL),
  })
  .strict()
  .transform((agent) => ({ ...agent, variant: agent.variant ?? (agent.placement === "bottom" ? ("inline" as const) : ("pill" as const)) }));
export type SellerAgent = z.infer<typeof sellerAgentSchema>;

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
  /** Optional IANA time zone of the seller (for example "Europe/Vienna"): the zone of the contact window hint and of the times in the messages to the seller when there are no viewing settings. */
  timezone: z.string().refine(isTimeZone, 'must be an IANA time zone such as "Europe/Vienna"').optional(),
  /** Optional override of the contact windows the form offers (the defaults are in contact-windows.ts). "anytime" must be one of them. */
  contactWindows: contactWindowsSchema.optional(),
  /** Optional voice assistant (see sellerAgentSchema). Nothing is loaded or registered without it. */
  agent: sellerAgentSchema.optional(),
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
  type: "version" | "text" | "localized" | "contact" | "languages" | "language" | "theme" | "link" | "viewing" | "agent" | "timezone" | "contactWindows";
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
  { key: "timezone", label: { en: "Time zone (IANA, for example Europe/Vienna)", de: "Zeitzone (IANA, zum Beispiel Europe/Vienna)" }, required: false, type: "timezone" },
  { key: "contactWindows", label: { en: "Contact windows (override of the defaults)", de: "Erreichbarkeitsfenster (überschreibt die Standardwerte)" }, required: false, type: "contactWindows" },
  { key: "agent", label: { en: "Voice assistant widget (id, variant, placement, theme, avatar)", de: "Sprachassistent-Widget (ID, Variante, Platzierung, Theme, Avatar)" }, required: false, type: "agent" },
  { key: "privacyUrl", label: { en: "Privacy page (placeholder)", de: "Datenschutzseite (Platzhalter)" }, required: false, type: "link" },
  { key: "imprintUrl", label: { en: "Imprint page (placeholder)", de: "Impressum (Platzhalter)" }, required: false, type: "link" },
] as const satisfies readonly SellerFieldDescriptor[];
