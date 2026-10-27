import type { FieldDescriptor, InferFields, ProductTypeFields } from "@/lib/fields";

export const propertyFields = [
  { key: "areaM2", type: "number", min: 1, unit: "m2", required: true, label: { en: "Living area", de: "Wohnfläche" } },
  { key: "rooms", type: "number", min: 1, required: true, label: { en: "Rooms", de: "Zimmer" } },
  { key: "plotM2", type: "number", min: 0, unit: "m2", required: false, label: { en: "Plot", de: "Grundstück" } },
  { key: "energyClass", type: "enum", options: ["A+", "A", "B", "C", "D", "E", "F", "G", "H"], required: true, label: { en: "Energy class", de: "Energieklasse" } },
  { key: "yearBuilt", type: "number", int: true, min: 1000, required: true, label: { en: "Year built", de: "Baujahr" } },
] as const satisfies readonly FieldDescriptor[];

export type Property = InferFields<typeof propertyFields>;

/** Plain data only (no functions). */
export const fields = {
  id: "house",
  label: { en: "House", de: "Haus" },
  allowedOfferTypes: ["sale", "rent"],
  media: { heroRatio: "16 / 9", galleryRatio: "16 / 9" },
  specGroups: [
    { id: "area", label: { en: "Area", de: "Fläche" }, order: 1 },
    { id: "rooms", label: { en: "Rooms", de: "Räume" }, order: 2 },
    { id: "plot", label: { en: "Plot", de: "Grundstück" }, order: 3 },
    { id: "energy", label: { en: "Energy", de: "Energie" }, order: 4 },
    { id: "location", label: { en: "Location", de: "Lage" }, order: 5 },
  ],
  specFields: [
    { key: "bedrooms", group: "rooms", required: false, label: { en: "Bedrooms", de: "Schlafzimmer" } },
    { key: "bathrooms", group: "rooms", required: false, label: { en: "Bathrooms", de: "Badezimmer" } },
    { key: "heating", group: "energy", required: false, label: { en: "Heating", de: "Heizung" } },
    { key: "location", group: "location", required: false, label: { en: "Location", de: "Lage" } },
  ],
  galleryTags: [],
  heroHighlights: ["area", "bedrooms", "plot", "location"],
  detailsKey: "property",
  detailsFields: propertyFields,
  requestTypes: ["viewing", "question", "offer"],
} as const satisfies ProductTypeFields;
