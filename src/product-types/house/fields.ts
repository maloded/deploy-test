import type { FieldDescriptor, InferFields, ProductTypeFields } from "@/lib/fields";

export const propertyFields = [
  { key: "areaM2", type: "number", min: 1, unit: "m2", required: true, label: { en: "Living area", de: "Wohnfläche", tr: "Yaşam alanı", bg: "Жилищна площ" } },
  { key: "rooms", type: "number", min: 1, required: true, label: { en: "Rooms", de: "Zimmer", tr: "Oda sayısı", bg: "Стаи" } },
  { key: "plotM2", type: "number", min: 0, unit: "m2", required: false, label: { en: "Plot", de: "Grundstück", tr: "Arsa", bg: "Парцел" } },
  { key: "energyClass", type: "enum", options: ["A+", "A", "B", "C", "D", "E", "F", "G", "H"], required: true, label: { en: "Energy class", de: "Energieklasse", tr: "Enerji sınıfı", bg: "Енергиен клас" } },
  { key: "yearBuilt", type: "number", int: true, min: 1000, required: true, label: { en: "Year built", de: "Baujahr", tr: "Yapım yılı", bg: "Година на строителство" } },
] as const satisfies readonly FieldDescriptor[];

export type Property = InferFields<typeof propertyFields>;

/** Plain data only (no functions). */
export const fields = {
  id: "house",
  label: { en: "House", de: "Haus", tr: "Ev", bg: "Къща" },
  allowedOfferTypes: ["sale", "rent"],
  media: { heroRatio: "16 / 9", galleryRatio: "16 / 9" },
  specGroups: [
    { id: "area", label: { en: "Area", de: "Fläche", tr: "Alan", bg: "Площ" }, order: 1 },
    { id: "rooms", label: { en: "Rooms", de: "Räume", tr: "Oda sayısı", bg: "Стаи" }, order: 2 },
    { id: "plot", label: { en: "Plot", de: "Grundstück", tr: "Arsa", bg: "Парцел" }, order: 3 },
    { id: "energy", label: { en: "Energy", de: "Energie", tr: "Enerji", bg: "Енергия" }, order: 4 },
    { id: "location", label: { en: "Location", de: "Lage", tr: "Konum", bg: "Местоположение" }, order: 5 },
  ],
  specFields: [
    { key: "bedrooms", group: "rooms", required: false, label: { en: "Bedrooms", de: "Schlafzimmer", tr: "Yatak odası", bg: "Спални" } },
    { key: "bathrooms", group: "rooms", required: false, label: { en: "Bathrooms", de: "Badezimmer", tr: "Banyo", bg: "Бани" } },
    { key: "heating", group: "energy", required: false, label: { en: "Heating", de: "Heizung", tr: "Isıtma", bg: "Отопление" } },
    { key: "location", group: "location", required: false, label: { en: "Location", de: "Lage", tr: "Konum", bg: "Местоположение" } },
  ],
  galleryTags: [],
  heroHighlights: ["area", "bedrooms", "plot", "location"],
  detailsKey: "property",
  detailsFields: propertyFields,
  schemaType: "Product",
  requestTypes: ["viewing", "question", "offer"],
} as const satisfies ProductTypeFields;
