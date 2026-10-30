import type { ProductTypeFields } from "@/lib/fields";

/** Plain data only (no functions). */
export const fields = {
  id: "car",
  label: { en: "Car", de: "Auto" },
  allowedOfferTypes: ["sale", "lease_takeover"],
  media: { heroRatio: "3 / 2", galleryRatio: "3 / 2" },
  specGroups: [
    { id: "engine", label: { en: "Engine", de: "Motor" }, order: 1 },
    { id: "body", label: { en: "Body", de: "Karosserie" }, order: 2 },
    { id: "interior", label: { en: "Interior", de: "Innenraum" }, order: 3 },
    { id: "equipment", label: { en: "Equipment", de: "Ausstattung" }, order: 4 },
    { id: "condition", label: { en: "Condition and history", de: "Zustand und Historie" }, order: 5 },
  ],
  specFields: [
    { key: "year", group: "condition", required: true, label: { en: "First registration", de: "Erstzulassung" } },
    { key: "power", group: "engine", required: true, label: { en: "Power", de: "Leistung" } },
    { key: "fuel", group: "engine", required: true, label: { en: "Fuel", de: "Kraftstoff" } },
    { key: "gearbox", group: "engine", required: false, label: { en: "Gearbox", de: "Getriebe" } },
    { key: "colour", group: "body", required: false, label: { en: "Colour", de: "Farbe" } },
    { key: "seats", group: "interior", required: false, label: { en: "Seats", de: "Sitze" } },
    { key: "mileage", group: "condition", required: false, label: { en: "Mileage", de: "Kilometerstand" } },
  ],
  galleryTags: ["exterior", "interior", "seats", "dashboard", "controls", "mileage", "trunk", "wheels", "door", "details", "defects"],
  heroHighlights: ["year", "power", "fuel", "mileage"],
  detailsKey: null,
  detailsFields: [],
  schemaType: "Car",
  requestTypes: ["viewing", "test_drive", "question", "offer"],
} as const satisfies ProductTypeFields;
