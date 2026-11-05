import type { FieldDescriptor, InferFields, ProductTypeFields } from "@/lib/fields";

export const provenanceFields = [
  { key: "box", type: "boolean", required: true, label: { en: "Original box", de: "Originalbox", tr: "Orijinal kutu", bg: "Оригинална кутия" } },
  { key: "papers", type: "boolean", required: true, label: { en: "Original papers", de: "Originalpapiere", tr: "Orijinal belgeler", bg: "Оригинални документи" } },
  { key: "serviceHistory", type: "localized", required: false, label: { en: "Service history", de: "Servicehistorie", tr: "Servis geçmişi", bg: "Сервизна история" } },
] as const satisfies readonly FieldDescriptor[];

export type Provenance = InferFields<typeof provenanceFields>;

/** Plain data only (no functions). */
export const fields = {
  id: "watch",
  label: { en: "Watch", de: "Uhr", tr: "Saat", bg: "Часовник" },
  allowedOfferTypes: ["sale"],
  media: { heroRatio: "1 / 1", galleryRatio: "1 / 1" },
  specGroups: [
    { id: "movement", label: { en: "Movement", de: "Uhrwerk", tr: "Mekanizma", bg: "Механизъм" }, order: 1 },
    { id: "case", label: { en: "Case", de: "Gehäuse", tr: "Kasa", bg: "Корпус" }, order: 2 },
    { id: "strap", label: { en: "Strap", de: "Armband", tr: "Kayış", bg: "Каишка" }, order: 3 },
    { id: "set", label: { en: "Set", de: "Lieferumfang", tr: "Set içeriği", bg: "Комплект" }, order: 4 },
  ],
  specFields: [
    { key: "movement", group: "movement", required: false, label: { en: "Movement", de: "Uhrwerk", tr: "Mekanizma", bg: "Механизъм" } },
    { key: "caseDiameter", group: "case", required: false, label: { en: "Case diameter", de: "Gehäusedurchmesser", tr: "Kasa çapı", bg: "Диаметър на корпуса" } },
    { key: "strap", group: "strap", required: false, label: { en: "Strap", de: "Armband", tr: "Kayış", bg: "Каишка" } },
  ],
  galleryTags: [],
  heroHighlights: ["movement", "caseDiameter", "strap"],
  detailsKey: "provenance",
  detailsFields: provenanceFields,
  schemaType: "Product",
  requestTypes: ["viewing", "question", "offer"],
} as const satisfies ProductTypeFields;
