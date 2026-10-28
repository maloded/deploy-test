import { z } from "zod";
import type { SellerContact } from "./seller";
import { AUDIO_FILE, AUDIO_FILE_MESSAGE, AUTOSTART_MODES, DEFAULT_AUTOSTART, DEFAULT_VOLUME, MAX_TITLE_CHARS, MAX_TRACKS } from "./music";
import { isLanguage, unsupportedLanguageMessage, type Language } from "./languages";
import { parseVideo } from "./video";
import { checkViewing, DAYS, MAX_DURATION, MIN_DURATION, isTime, isTimeZone, type ViewingSettings } from "./viewing";

export { LANGUAGES, type Language } from "./languages";

/**
 * The ONE list of block ids, in the default page order. The value says whether a component renders the block. The
 * implemented set and the default order of every product type are derived from this (see defaultBlocksFor in fields.ts).
 */
export const BLOCKS = { hero: true, gallery: true, video: true, specs: true, offer: true, faq: true, contact: true } as const;

export type BlockId = keyof typeof BLOCKS;
export const BLOCK_IDS = Object.keys(BLOCKS) as [BlockId, ...BlockId[]];
export const IMPLEMENTED_BLOCKS: readonly BlockId[] = BLOCK_IDS.filter((id) => BLOCKS[id]);

/** A language code of the registry (src/lib/languages.ts); anything else fails with the list of supported ones. */
export const languageSchema = z.custom<Language>(isLanguage, { error: (issue) => unsupportedLanguageMessage(issue.input) });

/**
 * Per-language text: at least one language of the registry. That the seller's default language is present, and the
 * fallback of the others to it, is decided where the seller is known (loadProduct in content.ts, localized.ts).
 */
export const localizedSchema = z
  .record(z.string(), z.string().min(1))
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!isLanguage(key)) ctx.addIssue({ code: "custom", path: [key], message: unsupportedLanguageMessage(key) });
    }
    if (Object.keys(value).length === 0) ctx.addIssue({ code: "custom", message: "needs a text in at least one language" });
  })
  .transform((value) => value as Partial<Record<Language, string>>);
export type Localized = Partial<Record<Language, string>>;

/**
 * Viewing settings (seller.json: the default; product.json: the override, merged field by field). Every field is
 * optional here; the merged result must be complete (the loader checks it). Formats and ranges are checked with
 * checkViewing (viewing.ts), the same function a test or a tool can call on plain data.
 */
export const viewingSchema = z
  .object({
    address: localizedSchema.optional(),
    days: z.array(z.enum(DAYS)).optional(),
    from: z.string().refine(isTime, 'must be a time like "10:00"').optional(),
    to: z.string().refine(isTime, 'must be a time like "17:00"').optional(),
    durationMinutes: z.number().int().min(MIN_DURATION).max(MAX_DURATION).optional(),
    timezone: z.string().refine(isTimeZone, 'must be an IANA time zone such as "Europe/Vienna"').optional(),
    notes: localizedSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const message of checkViewing(v as ViewingSettings)) ctx.addIssue({ code: "custom", path: [message.split(":")[0]], message: message.slice(message.indexOf(":") + 2) });
  });

/** Focus point of a photo, as fractions of its width and height. Used as CSS object-position when cropping. */
export const focusSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export type Focus = z.infer<typeof focusSchema>;

const fileName = z.string().min(1).regex(/^[^/\\]+$/, "must be a plain file name inside media/, without folders");

/**
 * Optional background music. Not shown on the page: `license` is a note for whoever keeps the content (where the track is
 * licensed from; the proof is kept next to the file in the content repository). The files are checked by the loader
 * (they exist in media/, at most 5 MB each).
 */
const musicTrackSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and dashes"),
    title: localizedSchema.refine((t) => Object.values(t).every((v) => Array.from(v).length <= MAX_TITLE_CHARS), `at most ${MAX_TITLE_CHARS} characters per language`),
    file: z.string().regex(AUDIO_FILE, AUDIO_FILE_MESSAGE),
    license: z.string().min(1),
  })
  .strict();
export const musicSchema = z
  .object({
    tracks: z.array(musicTrackSchema).min(1).max(MAX_TRACKS),
    defaultTrack: z.string().min(1).optional(),
    volume: z.number().min(0).max(1).default(DEFAULT_VOLUME),
    autostart: z.enum(AUTOSTART_MODES).default(DEFAULT_AUTOSTART),
  })
  .strict()
  .superRefine((m, ctx) => {
    const ids = m.tracks.map((t) => t.id);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: "custom", path: ["tracks", i, "id"], message: `"${id}" is used twice (ids must be unique)` });
    });
    if (m.defaultTrack !== undefined && !ids.includes(m.defaultTrack)) ctx.addIssue({ code: "custom", path: ["defaultTrack"], message: `"${m.defaultTrack}" is not a track id (${ids.join(", ")})` });
  });

/** A details object: its shape is checked later, against the product type or offer type. */
const looseObject = z.record(z.string(), z.unknown());

const specSchema = z.object({
  key: z.string().min(1),
  label: localizedSchema,
  value: z.union([z.string().min(1), localizedSchema]),
  /** Must be one of the product type's spec groups. */
  group: z.string().min(1).optional(),
});

const priceSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 code such as EUR"),
  per: z.enum(["month", "week", "year"]).optional(),
  note: localizedSchema.optional(),
});

/**
 * Structure shared by every product. productType and offerType are plain strings here: they are checked
 * against the registries (and their details objects validated) by validateProduct() in validate.ts.
 */
export const baseShape = {
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase letters, digits and dashes"),
  productType: z.string().min(1),
  offerType: z.string().min(1),
  /** Optional override of the seller's default theme (seller.json "theme"). */
  theme: z.string().min(1).optional(),
  /** Optional viewing settings that override the seller's (see viewingSchema). */
  viewing: viewingSchema.optional(),
  title: localizedSchema,
  tagline: localizedSchema,
  price: priceSchema,
  /** Offer details, under the key the offer type names (lease, rent, ...). */
  lease: looseObject.optional(),
  rent: looseObject.optional(),
  /** Product type details, under the key the product type names (property, provenance, ...). */
  details: looseObject.optional(),
  specs: z.array(specSchema),
  media: z.object({
    hero: fileName,
    heroFocus: focusSchema.optional(),
    gallery: z.array(
      z.object({
        file: fileName,
        alt: localizedSchema,
        focus: focusSchema.optional(),
        /** Optional tags from the product type's closed list (checked in validate.ts). */
        tags: z.array(z.string().min(1)).min(1).optional(),
      }),
    ),
    background: fileName.nullable(),
    /** A YouTube or Vimeo URL, or an mp4/webm file name inside media/. */
    video: z
      .string()
      .min(1)
      .nullable()
      .superRefine((v, ctx) => {
        if (v === null) return;
        const parsed = parseVideo(v);
        if ("error" in parsed) ctx.addIssue({ code: "custom", message: parsed.error });
      }),
    /** Poster image for the video (a file inside media/). */
    videoPoster: fileName.optional(),
  }),
  /**
   * Hero options, all optional. eyebrow: short texts shown before the offer type label, joined with " · " (for
   * example the place); headline: the big line (default: the short form of the title); description (default: the
   * tagline); highlights: up to 4 spec KEYS whose value, label and unit are taken from specs (a figure lives in
   * one place only); trust: short items shown as one thin line under the intro row.
   */
  hero: z
    .object({
      eyebrow: z.array(localizedSchema).min(1).max(3).optional(),
      headline: localizedSchema.optional(),
      description: localizedSchema.optional(),
      highlights: z.array(z.string().min(1)).min(1).max(4).optional(),
      trust: z.array(localizedSchema).min(1).max(6).optional(),
    })
    .strict()
    .optional(),
  /** Gallery options (the photos themselves are media.gallery). */
  gallery: z.object({ autoplaySeconds: z.number().min(2).max(60).nullable() }).strict().optional(),
  faq: z.array(z.object({ q: localizedSchema, a: localizedSchema })),
  /** Optional background music (see musicSchema). Without it nothing is rendered or loaded. */
  music: musicSchema.optional(),
  /** Optional: the product type's default block order is used when omitted. */
  blocks: z.array(z.enum(BLOCK_IDS)).min(1).optional(),
};

// Loose so that a registered offer type can add its own details key (for example "auction").
// validate.ts rejects every top-level key that no registry knows.
export const productSchema = z.looseObject(baseShape).superRefine((p, ctx) => {
  if (p.blocks && new Set(p.blocks).size !== p.blocks.length) {
    ctx.addIssue({ code: "custom", path: ["blocks"], message: "each block id may appear only once" });
  }
});

/** What product.json holds (brand, contact, languages and the default theme live in the seller's seller.json). */
export type ProductFile = z.infer<typeof productSchema>;

/**
 * The product as the components use it: product.json merged with its seller (see loadProduct in content.ts).
 * languages, defaultLanguage and contact come from seller.json; theme is the product's override, else the seller's.
 */
export type Product = ProductFile & {
  theme: string;
  languages: Language[];
  defaultLanguage: Language;
  contact: SellerContact;
};

/** Human-readable lines such as `price.amount: Invalid input: expected number, received string`. */
export function formatIssues(error: z.ZodError, prefix: string[] = []): string[] {
  return error.issues.map((i) => {
    const path = [...prefix, ...i.path].join(".");
    return `${path || "(root)"}: ${i.message}`;
  });
}
