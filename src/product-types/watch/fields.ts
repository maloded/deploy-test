import type { FieldDescriptor, InferFields, ProductTypeFields } from "@/lib/fields";

export const provenanceFields = [
  { key: "box", type: "boolean", required: true, label: { en: "Original box", de: "Originalbox" } },
  { key: "papers", type: "boolean", required: true, label: { en: "Original papers", de: "Originalpapiere" } },
  { key: "serviceHistory", type: "localized", required: false, label: { en: "Service history", de: "Servicehistorie" } },
] as const satisfies readonly FieldDescriptor[];

export type Provenance = InferFields<typeof provenanceFields>;

/** Plain data only (no functions). */
export const fields = {
  id: "watch",
  label: { en: "Watch", de: "Uhr" },
  allowedOfferTypes: ["sale"],
  media: { heroRatio: "1 / 1", galleryRatio: "1 / 1" },
  specGroups: [
    { id: "movement", label: { en: "Movement", de: "Uhrwerk" }, order: 1 },
    { id: "case", label: { en: "Case", de: "Gehäuse" }, order: 2 },
    { id: "strap", label: { en: "Strap", de: "Armband" }, order: 3 },
    { id: "set", label: { en: "Set", de: "Lieferumfang" }, order: 4 },
  ],
  specFields: [
    { key: "movement", group: "movement", required: false, label: { en: "Movement", de: "Uhrwerk" } },
    { key: "caseDiameter", group: "case", required: false, label: { en: "Case diameter", de: "Gehäusedurchmesser" } },
    { key: "strap", group: "strap", required: false, label: { en: "Strap", de: "Armband" } },
  ],
  galleryTags: [],
  heroHighlights: ["movement", "caseDiameter", "strap"],
  detailsKey: "provenance",
  detailsFields: provenanceFields,
  requestTypes: ["viewing", "question", "offer"],
} as const satisfies ProductTypeFields;
