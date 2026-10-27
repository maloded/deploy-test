import { z } from "zod";
import { BLOCK_IDS, localizedSchema, type BlockId, type Localized } from "./schema";

/**
 * Field descriptors are PLAIN DATA (no functions), so product types and offer types stay serializable
 * (an admin app or a voice agent can read them). The zod schema of a "details" object is built from them.
 */
export type FieldUnit = "money" | "months" | "km" | "m2";

type FieldBase = { key: string; label: Localized; required: boolean; unit?: FieldUnit };

export type FieldDescriptor = FieldBase &
  (
    | { type: "string" }
    | { type: "number"; min?: number; int?: boolean }
    | { type: "boolean" }
    | { type: "date" }
    | { type: "enum"; options: readonly string[] }
    | { type: "localized" }
  );

type ValueOf<F> = F extends { type: "number" }
  ? number
  : F extends { type: "boolean" }
    ? boolean
    : F extends { type: "enum"; options: readonly (infer O)[] }
      ? O
      : F extends { type: "localized" }
        ? Localized
        : string;

/** TypeScript type of a details object, derived from its descriptors (declare them `as const`). */
export type InferFields<Fs extends readonly FieldDescriptor[]> = {
  [F in Fs[number] as F extends { required: true } ? F["key"] : never]: ValueOf<F>;
} & {
  [F in Fs[number] as F extends { required: true } ? never : F["key"]]?: ValueOf<F>;
};

export type SpecGroup = { id: string; label: Localized; order: number };
export type SpecField = { key: string; group: string; label: Localized; required: boolean };

/** What a product type (car, house, ...) contributes. Plain data. */
export type ProductTypeFields = {
  id: string;
  label: Localized;
  allowedOfferTypes: readonly string[];
  /** Optional block order used when product.json has no "blocks". Omitted = every block id in BLOCK_IDS order. */
  defaultBlocks?: readonly BlockId[];
  /** CSS aspect-ratio strings, for example "3 / 2". */
  media: { heroRatio: string; galleryRatio: string };
  specGroups: readonly SpecGroup[];
  /** Known spec keys; `required` ones must appear in product.specs. Other keys are always allowed. */
  specFields: readonly SpecField[];
  /**
   * Closed list of tags a gallery photo may carry (media.gallery[].tags), for example for a voice agent that looks
   * for "dashboard" photos. Empty = tags are not defined for this type yet and are rejected.
   */
  galleryTags: readonly string[];
  /** Spec keys shown as the hero's key facts when product.json has no hero.highlights (only those that exist). */
  heroHighlights: readonly string[];
  /** Key inside product.details for this type's extra data, or null when the type has none. */
  detailsKey: string | null;
  detailsFields: readonly FieldDescriptor[];
};

/** The block order for a product that has no "blocks": the type's own, or the one list of block ids. */
export function defaultBlocksFor(type: ProductTypeFields): readonly BlockId[] {
  return type.defaultBlocks ?? BLOCK_IDS;
}

/** What an offer type (sale, lease_takeover, rent) contributes. Plain data plus a variant name. */
export type OfferTypeDef = {
  id: string;
  label: Localized;
  /** Name of the offer block variant that renders it (see OFFER_VARIANTS). */
  variant: string;
  /** Top-level product.json key holding the details object (for example "lease"), or null. */
  detailsKey: string | null;
  detailsFields: readonly FieldDescriptor[];
  price: { per: "required" | "forbidden" | "optional" };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fieldSchema(f: FieldDescriptor): z.ZodType {
  switch (f.type) {
    case "string":
      return z.string().min(1);
    case "number": {
      let n = z.number();
      if (f.int) n = n.int();
      if (f.min !== undefined) n = n.min(f.min);
      return n;
    }
    case "boolean":
      return z.boolean();
    case "date":
      return z.string().regex(DATE, "must be YYYY-MM-DD");
    case "enum":
      return z.enum(f.options as [string, ...string[]]);
    case "localized":
      return localizedSchema;
  }
}

export function buildObjectSchema(fields: readonly FieldDescriptor[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.key] = f.required ? fieldSchema(f) : fieldSchema(f).optional();
  return z.object(shape).strict();
}
