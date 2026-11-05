import type { FieldDescriptor, InferFields, ProductTypeFields } from "@/lib/fields";

export const authenticityFields = [
  { key: "certificate", type: "boolean", required: true, label: { en: "Authenticity certificate", de: "Echtheitszertifikat", tr: "Orijinallik sertifikası", bg: "Сертификат за автентичност" } },
  { key: "serialPresent", type: "boolean", required: true, label: { en: "Serial number present", de: "Seriennummer vorhanden", tr: "Seri numarası mevcut", bg: "Налице е сериен номер" } },
  { key: "purchasedFrom", type: "string", required: true, label: { en: "Purchased from", de: "Gekauft bei", tr: "Satın alınan yer", bg: "Закупено от" } },
] as const satisfies readonly FieldDescriptor[];

export type Authenticity = InferFields<typeof authenticityFields>;

/** Plain data only (no functions). */
export const fields = {
  id: "bag",
  label: { en: "Bag", de: "Tasche", tr: "Çanta", bg: "Чанта" },
  allowedOfferTypes: ["sale"],
  media: { heroRatio: "4 / 5", galleryRatio: "4 / 5" },
  specGroups: [
    { id: "material", label: { en: "Material", de: "Material", tr: "Malzeme", bg: "Материал" }, order: 1 },
    { id: "dimensions", label: { en: "Dimensions", de: "Maße", tr: "Ölçüler", bg: "Размери" }, order: 2 },
    { id: "condition", label: { en: "Condition", de: "Zustand", tr: "Durum", bg: "Състояние" }, order: 3 },
    { id: "authenticity", label: { en: "Authenticity", de: "Echtheit", tr: "Orijinallik", bg: "Автентичност" }, order: 4 },
  ],
  specFields: [
    { key: "material", group: "material", required: false, label: { en: "Material", de: "Material", tr: "Malzeme", bg: "Материал" } },
    { key: "dimensions", group: "dimensions", required: false, label: { en: "Dimensions", de: "Maße", tr: "Ölçüler", bg: "Размери" } },
    { key: "condition", group: "condition", required: false, label: { en: "Condition", de: "Zustand", tr: "Durum", bg: "Състояние" } },
  ],
  galleryTags: [],
  heroHighlights: ["material", "dimensions", "condition"],
  detailsKey: "authenticity",
  detailsFields: authenticityFields,
  schemaType: "Product",
  requestTypes: ["viewing", "question", "offer"],
} as const satisfies ProductTypeFields;
