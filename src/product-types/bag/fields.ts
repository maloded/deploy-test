import type { FieldDescriptor, InferFields, ProductTypeFields } from "@/lib/fields";

export const authenticityFields = [
  { key: "certificate", type: "boolean", required: true, label: { en: "Authenticity certificate", de: "Echtheitszertifikat" } },
  { key: "serialPresent", type: "boolean", required: true, label: { en: "Serial number present", de: "Seriennummer vorhanden" } },
  { key: "purchasedFrom", type: "string", required: true, label: { en: "Purchased from", de: "Gekauft bei" } },
] as const satisfies readonly FieldDescriptor[];

export type Authenticity = InferFields<typeof authenticityFields>;

/** Plain data only (no functions). */
export const fields = {
  id: "bag",
  label: { en: "Bag", de: "Tasche", ru: "Сумка", uk: "Сумка" },
  allowedOfferTypes: ["sale"],
  media: { heroRatio: "4 / 5", galleryRatio: "4 / 5" },
  specGroups: [
    { id: "material", label: { en: "Material", de: "Material" }, order: 1 },
    { id: "dimensions", label: { en: "Dimensions", de: "Maße" }, order: 2 },
    { id: "condition", label: { en: "Condition", de: "Zustand" }, order: 3 },
    { id: "authenticity", label: { en: "Authenticity", de: "Echtheit" }, order: 4 },
  ],
  specFields: [
    { key: "material", group: "material", required: false, label: { en: "Material", de: "Material" } },
    { key: "dimensions", group: "dimensions", required: false, label: { en: "Dimensions", de: "Maße" } },
    { key: "condition", group: "condition", required: false, label: { en: "Condition", de: "Zustand" } },
  ],
  galleryTags: [],
  heroHighlights: ["material", "dimensions", "condition"],
  detailsKey: "authenticity",
  detailsFields: authenticityFields,
} as const satisfies ProductTypeFields;
