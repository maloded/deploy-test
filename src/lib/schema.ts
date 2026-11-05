import { z } from "zod";
import type { SellerContact } from "./seller";
import { AUDIO_FILE, AUDIO_FILE_MESSAGE, DEFAULT_VOLUME, MAX_CREDIT_CHARS, MAX_TITLE_CHARS, MAX_TRACKS } from "./music";
import { isLanguage, unsupportedLanguageMessage, type Language } from "./languages";
import { parseVideo } from "./video";
import { GALLERY_CATEGORIES, SLUG_PATTERN } from "./gallery-model";
import { checkContactWindows } from "./contact-windows";
import { LOGO_FILE, LOGO_FILE_MESSAGE } from "./seller-logo";
import { checkViewing, DAYS, MAX_DURATION, MIN_DURATION, isTime, isTimeZone, type ViewingSettings } from "./viewing";

export { LANGUAGES, type Language } from "./languages";

/**
 * The ONE list of block ids, in the default page order. The value says whether a component renders the block. The
 * implemented set and the default order of every product type are derived from this (see defaultBlocksFor in fields.ts).
 */
const frameSchema = z
  .object({ left: z.number().min(-300).max(100), right: z.number().min(0).max(400), top: z.number().min(-300).max(100), bottom: z.number().min(0).max(400) })
  .strict()
  .refine((f) => f.right > f.left && f.bottom > f.top, "right must be greater than left and bottom greater than top");

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

/**
 * The seller's contact windows (seller.json, optional; the defaults are in contact-windows.ts): code, hours and a label per
 * language. The rules (unique codes, from before to, "anytime" present) are checkContactWindows.
 */
export const contactWindowSchema = z
  .object({ code: z.string(), from: z.string().optional(), to: z.string().optional(), label: localizedSchema })
  .strict();
export const contactWindowsSchema = z.array(contactWindowSchema).min(1).superRefine((windows, ctx) => {
  for (const message of checkContactWindows(windows as never)) {
    const [path, ...rest] = message.split(": ");
    ctx.addIssue({ code: "custom", path: path.split(".").slice(1).map((p) => (/^\d+$/.test(p) ? Number(p) : p)), message: rest.join(": ") });
  }
});
/** Focus point of a photo, as fractions of its width and height. Used as CSS object-position when cropping. */
export const focusSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export type Focus = z.infer<typeof focusSchema>;

const fileName = z.string().min(1).regex(/^[^/\\]+$/, "must be a plain file name inside media/, without folders");

/** A slug: lower-case words joined by single hyphens. Used for photo and spot ids. */
const slugSchema = z.string().min(1).max(40).regex(SLUG_PATTERN, "must be a slug: lower-case letters and digits, words joined by single hyphens");

/**
 * A spot on a gallery photo: a position (0..1 of the photo), a label, and facts: spec keys (the figure lives in specs), explicit rows
 * (label and value in each language, for a row that is worded for this spot) and/or a short text. `aliases` are other names that
 * resolve to this spot (older ids, or the names another site uses).
 */
const hotspotSchema = z
  .object({
    id: slugSchema,
    aliases: z.array(slugSchema).min(1).max(8).optional(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    label: localizedSchema,
    specKeys: z.array(z.string().min(1)).min(1).max(6).optional(),
    facts: z.array(z.object({ label: localizedSchema, value: localizedSchema }).strict()).min(1).max(6).optional(),
    text: localizedSchema.optional(),
  })
  .strict()
  .refine((h) => h.specKeys !== undefined || h.facts !== undefined || h.text !== undefined, { message: "needs specKeys, facts or text (the facts of the spot)" });

/**
 * Optional background music. Not shown on the page: `license` is a note for whoever keeps the content (where the track is
 * licensed from; the proof is kept next to the file in the content repository). The files are checked by the loader
 * (they exist in media/, at most 3 MB each). `credit` (and `creditUrl`, an https address) is the one text of a track that IS shown, in the
 * footer: set it only when the track's licence requires a credit line; a track without `credit` shows nothing.
 */
const musicTrackSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and dashes"),
    title: localizedSchema.refine((t) => Object.values(t).every((v) => Array.from(v).length <= MAX_TITLE_CHARS), `at most ${MAX_TITLE_CHARS} characters per language`),
    file: z.string().regex(AUDIO_FILE, AUDIO_FILE_MESSAGE),
    license: z.string().min(1),
    credit: z.string().trim().min(1).max(MAX_CREDIT_CHARS).optional(),
    creditUrl: z.string().regex(/^https:\/\/[^\s"'<>]+$/i, "must be an https:// address").optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.creditUrl !== undefined && t.credit === undefined) ctx.addIssue({ code: "custom", path: ["creditUrl"], message: "needs a credit (the text the link is shown with)" });
  });
export const musicSchema = z
  .object({
    tracks: z.array(musicTrackSchema).min(1).max(MAX_TRACKS),
    defaultTrack: z.string().min(1).optional(),
    volume: z.number().min(0).max(1).default(DEFAULT_VOLUME),
    /** Removed: the music starts only from the player's button. A product.json that still has it (any of its two old values) loads, and the value is dropped. */
    autostart: z.enum(["button", "gesture"]).optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const ids = m.tracks.map((t) => t.id);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: "custom", path: ["tracks", i, "id"], message: `"${id}" is used twice (ids must be unique)` });
    });
    if (m.defaultTrack !== undefined && !ids.includes(m.defaultTrack)) ctx.addIssue({ code: "custom", path: ["defaultTrack"], message: `"${m.defaultTrack}" is not a track id (${ids.join(", ")})` });
  })
  .transform(({ autostart, ...music }) => {
    void autostart; // dropped
    return music;
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
    /** The hero file is a cut-out on transparency (a PNG or WebP with an alpha channel): it is never cropped, and the theme paints a soft backdrop behind it instead of a photo box. */
    heroCutout: z.boolean().optional(),
    gallery: z.array(
      z.object({
        /** Stable id (a slug): the address of the photo (#photo-<id>) and its name for the voice agent. Unique in the gallery. */
        id: slugSchema,
        /** Other names that resolve to this photo (older or alternative ids). Unique, and never equal to any id. */
        aliases: z.array(slugSchema).min(1).max(8).optional(),
        category: z.enum(GALLERY_CATEGORIES),
        file: fileName,
        /** A cut-out of this photo (a PNG or WebP on transparency) that the page uses instead of it where the van is shown on the theme's backdrop (the hero and its tiles). */
        cutout: fileName.optional(),
        alt: localizedSchema,
        /** Short text shown under the photo (alt is for screen readers and stays the longer description). */
        caption: localizedSchema.optional(),
        focus: focusSchema.optional(),
        /** Optional tags from the product type's closed list (checked in validate.ts). */
        tags: z.array(z.string().min(1)).min(1).optional(),
        /** Spots on the photo that open a small card. Spot ids are unique across the whole gallery. */
        hotspots: z.array(hotspotSchema).min(1).max(8).optional(),
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
   * one place only); trust: short items shown as one thin line under the intro row (a checklist on a phone); priceLabel and shortCta are only used by the phone layout.
   */
  hero: z
    .object({
      eyebrow: z.array(localizedSchema).min(1).max(3).optional(),
      headline: localizedSchema.optional(),
      description: localizedSchema.optional(),
      highlights: z.array(z.string().min(1)).min(1).max(4).optional(),
      trust: z.array(localizedSchema).min(1).max(6).optional(),
      /** The small label over the price in the phone layout ("Kaufpreis"); default: from the page language, by offer type. */
      priceLabel: localizedSchema.optional(),
      /** The compact button beside the price in the phone layout ("Termin"); it opens the contact form like the big button. */
      shortCta: localizedSchema.optional(),
      /**
       * The photo area of a hero with the agent's card: "tiles" (default: the photo and, beside it, two small tiles that open the gallery) or "single" (the photo
       * alone, one large image filling the left column, no tiles). `podium` and `lights` belong to "single" with a cut-out photo (media.heroCutout) and are ignored otherwise.
       */
      mode: z.enum(["tiles", "single"]).optional(),
      /**
       * The cut-out stands on a quiet oval podium: true (an oval under the photo's bottom edge) or its geometry, so that another photo can be tuned without code. The
       * oval is the footprint seen from the camera's height: `x` and `y` its centre in percent of the photo's width and height (default 50 and 100), `angle` the tilt
       * of its long axis in degrees (default 0; positive: the right end lower, as the line from a car's rear wheel to its front wheel in a three-quarter photo),
       * `ratio` its height over its width before the tilt (default 0.3; a flat oval is a camera at table height, a rounder one a raised camera), `scale` its width as a
       * multiple of the photo's width (default 1.2), `shadowY` where the contact shadow is centred (percent of the photo's height, default `y`: under the tyres, so that the oval can move without the shadow), `textOffset` moves the lettering along the rim (percent of the oval's width, positive: to the right, default 0), `emblem` an SVG file next to product.json (the same plain-shapes rules as the seller's logo) engraved before the text at the same height, `text` the lettering engraved on the near rim (a string or a localized one, at most 24 characters: the brand; none: no engraving), `leds` recessed spots around the top surface (`true` or `{ count: 3-24 (default 12), colour: "#rrggbb" (default: warm white from the theme), breathe: true for a very slow, faint pulse }`; off by default), `phoneScale` and `phoneY` the same for the layouts of `phoneFrame` (default: `scale` and `y`; a phone's oval may be a little smaller against the van, and lower so that there is more surface in front of it; the contact shadow stays where `y` puts it, under the tyres), `thickness` the platform's edge in percent of its width (default 3.5). The rim shows on the near side only.
       */
      podium: z
        .union([
          z.boolean(),
          z
            .object({
              x: z.number().min(-50).max(150).optional(),
              y: z.number().min(-50).max(200).optional(),
              angle: z.number().min(-80).max(80).optional(),
              ratio: z.number().min(0.1).max(1).optional(),
              scale: z.number().min(0.3).max(3).optional(),
              phoneScale: z.number().min(0.3).max(3).optional(),
              phoneY: z.number().min(-50).max(200).optional(),
              shadowY: z.number().min(-50).max(200).optional(),
              textOffset: z.number().min(-30).max(30).optional(),
              emblem: z.string().regex(LOGO_FILE, LOGO_FILE_MESSAGE).optional(),
              text: z.union([z.string().trim().min(1).max(24), localizedSchema]).optional(),
              leds: z
                .union([
                  z.boolean(),
                  z
                    .object({
                      count: z.number().int().min(3).max(24).optional(),
                      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour: # and six hexadecimal digits").optional(),
                      breathe: z.boolean().optional(),
                      twinkle: z.boolean().optional(),
                      period: z.number().min(3).max(20).optional(),
                    })
                    .strict(),
                ])
                .optional(),
              thickness: z.number().min(0).max(12).optional(),
            })
            .strict(),
        ])
        .optional(),
      /**
       * The area of the photo's coordinate space that is fitted into the panel, in percent of the photo's width and height (the photo itself is 0..100 each way; a
       * frame may reach beyond it). Without it the area is the photo plus whatever the podium needs, so changing the podium moves and rescales the van; with it the
       * van keeps its place and size however the podium is tuned (a podium that reaches beyond the frame still widens it, nothing is cut off). In the one-screen
       * layout (a wide, tall window) the panel is as wide as this frame is wide: the frame's room at the sides is the panel's side margin, so the panel hugs its picture.
       */
      frame: frameSchema.optional(),
      /** The same for the layouts that are not the one-screen one (a phone, a short window): there the panel is a box of its own ratio, so it wants its own, usually narrower frame. Without it `frame` is used. */
      phoneFrame: frameSchema.optional(),
      /**
       * Lights of the cut-out that glow now and then (the headlights: two soft flashes, a pause of several seconds; no motion for a visitor who asked for less). Each
       * point: `x` and `y` in percent of the photo, `size` the glow's width in percent of the photo's width, `aspect` its width over its height (default 1, a
       * round glow), `angle` its tilt in degrees (default 0). None: nothing glows.
       */
      lights: z
        .array(
          z
            .object({
              x: z.number().min(0).max(100),
              y: z.number().min(0).max(100),
              size: z.number().min(0.5).max(60),
              aspect: z.number().min(0.2).max(8).optional(),
              angle: z.number().min(-90).max(90).optional(),
            })
            .strict(),
        )
        .max(6)
        .optional(),
    })
    .strict()
    .optional(),
  /** Gallery options (the photos themselves are media.gallery). */
  gallery: z
    .object({
      autoplaySeconds: z.number().min(2).max(60).nullable(),
      /** Optional names of the three categories, instead of the page language's defaults. */
      categoryLabels: z.object({ exterior: localizedSchema.optional(), interior: localizedSchema.optional(), details: localizedSchema.optional() }).strict().optional(),
    })
    .strict()
    .optional(),
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
