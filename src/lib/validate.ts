import { buildObjectSchema, type FieldDescriptor, type OfferTypeDef, type ProductTypeFields } from "./fields";
import { baseShape, formatIssues, productSchema, type ProductFile } from "./schema";
import { offerTypes } from "@/offer-types";
import { productTypes } from "@/product-types";

export type Registries = {
  productTypes: Record<string, ProductTypeFields>;
  offerTypes: Record<string, OfferTypeDef>;
};

export const defaultRegistries: Registries = { productTypes, offerTypes };

/** `product` is the content of product.json; the seller's fields are merged in by loadProduct (content.ts). */
export type ValidationResult = { ok: true; product: ProductFile; typeFields: ProductTypeFields } | { ok: false; issues: string[] };

/** Fields that used to be in product.json and now live in the seller's seller.json. */
const MOVED_TO_SELLER = ["brand", "contact", "languages"];

const own = <T>(map: Record<string, T>, key: string): T | undefined => (Object.hasOwn(map, key) ? map[key] : undefined);

function checkDetails(
  value: unknown,
  fields: readonly FieldDescriptor[],
  path: string[],
  issues: string[],
) {
  const r = buildObjectSchema(fields).safeParse(value);
  if (!r.success) issues.push(...formatIssues(r.error, path));
}

/**
 * Validation chain: base structure, then the product type, then the offer type (must be allowed for the
 * product type), then the offer's details object, price rules, and the product type's details and specs.
 * Returns a flat, human-readable list of problems.
 */
export function validateProduct(raw: unknown, reg: Registries = defaultRegistries): ValidationResult {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: formatIssues(parsed.error) };
  const p = parsed.data;
  const record = p as Record<string, unknown>;
  const issues: string[] = [];

  const offerKeys = Object.values(reg.offerTypes).flatMap((o) => (o.detailsKey ? [o.detailsKey] : []));
  const known = new Set([...Object.keys(baseShape), ...offerKeys]);
  for (const key of Object.keys(p)) {
    if (known.has(key)) continue;
    issues.push(MOVED_TO_SELLER.includes(key) ? `${key}: moved to the seller's seller.json (run scripts/migrate-content.mjs)` : `${key}: unknown field`);
  }

  const type = own(reg.productTypes, p.productType);
  if (!type) {
    issues.push(`productType: unknown "${p.productType}". Known product types: ${Object.keys(reg.productTypes).join(", ")}`);
  }

  const offer = own(reg.offerTypes, p.offerType);
  if (!offer) {
    issues.push(`offerType: unknown "${p.offerType}". Known offer types: ${Object.keys(reg.offerTypes).join(", ")}`);
  } else {
    if (type && !type.allowedOfferTypes.includes(p.offerType)) {
      issues.push(
        `offerType: "${p.offerType}" is not allowed for product type "${p.productType}". Allowed offer types: ${type.allowedOfferTypes.join(", ")}`,
      );
    }

    if (offer.detailsKey) {
      if (record[offer.detailsKey] === undefined) {
        issues.push(`${offer.detailsKey}: is required when offerType is "${offer.id}"`);
      } else {
        checkDetails(record[offer.detailsKey], offer.detailsFields, [offer.detailsKey], issues);
      }
    }

    if (offer.price.per === "required" && !p.price.per) {
      issues.push(`price.per: is required when offerType is "${offer.id}"`);
    } else if (offer.price.per === "forbidden" && p.price.per) {
      issues.push(`price.per: must not be set when offerType is "${offer.id}"`);
    }
  }

  // Details objects that belong to another offer type
  for (const [id, o] of Object.entries(reg.offerTypes)) {
    if (o.detailsKey && o.detailsKey !== offer?.detailsKey && record[o.detailsKey] !== undefined) {
      issues.push(`${o.detailsKey}: is only allowed when offerType is "${id}"`);
    }
  }

  if (type) {
    const details = p.details ?? {};
    for (const key of Object.keys(details)) {
      if (key !== type.detailsKey) {
        issues.push(`details.${key}: not used by product type "${p.productType}"${type.detailsKey ? ` (expected details.${type.detailsKey})` : ""}`);
      }
    }
    if (type.detailsKey) {
      if (details[type.detailsKey] === undefined) {
        issues.push(`details.${type.detailsKey}: is required for product type "${p.productType}"`);
      } else {
        checkDetails(details[type.detailsKey], type.detailsFields, ["details", type.detailsKey], issues);
      }
    }

    p.media.gallery.forEach((g, i) => {
      if (!g.tags) return;
      if (type.galleryTags.length === 0) {
        issues.push(`media.gallery.${i}.tags: tags are not defined for product type "${p.productType}" yet`);
        return;
      }
      for (const tag of g.tags) {
        if (!type.galleryTags.includes(tag)) {
          issues.push(`media.gallery.${i}.tags: unknown tag "${tag}" for product type "${p.productType}". Allowed tags: ${type.galleryTags.join(", ")}`);
        }
      }
    });

    const specKeys = p.specs.map((s) => s.key);
    (p.hero?.highlights ?? []).forEach((key, i) => {
      if (!specKeys.includes(key)) {
        issues.push(`hero.highlights.${i}: no spec with key "${key}". Spec keys: ${specKeys.join(", ") || "(none)"}`);
      }
    });

    const groups = type.specGroups.map((g) => g.id);
    p.specs.forEach((s, i) => {
      if (s.group && !groups.includes(s.group)) {
        issues.push(`specs.${i}.group: unknown group "${s.group}" for product type "${p.productType}". Groups: ${groups.join(", ")}`);
      }
    });
    for (const f of type.specFields) {
      if (f.required && !p.specs.some((s) => s.key === f.key)) {
        issues.push(`specs: missing required spec "${f.key}" for product type "${p.productType}"`);
      }
    }
  }

  if (issues.length || !type) return { ok: false, issues };
  return { ok: true, product: p, typeFields: type };
}
