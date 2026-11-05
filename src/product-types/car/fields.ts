import type { ProductTypeFields } from "@/lib/fields";

/** Plain data only (no functions). */
export const fields = {
  id: "car",
  label: { en: "Car", de: "Auto", tr: "Araç", bg: "Автомобил" },
  allowedOfferTypes: ["sale", "lease_takeover"],
  media: { heroRatio: "3 / 2", galleryRatio: "3 / 2" },
  specGroups: [
    { id: "engine", label: { en: "Engine", de: "Motor", tr: "Motor", bg: "Двигател" }, order: 1 },
    { id: "body", label: { en: "Body", de: "Karosserie", tr: "Kaporta", bg: "Каросерия" }, order: 2 },
    { id: "interior", label: { en: "Interior", de: "Innenraum", tr: "İç mekân", bg: "Интериор" }, order: 3 },
    { id: "equipment", label: { en: "Equipment", de: "Ausstattung", tr: "Donanım", bg: "Оборудване" }, order: 4 },
    { id: "condition", label: { en: "Condition and history", de: "Zustand und Historie", tr: "Durum ve geçmiş", bg: "Състояние и история" }, order: 5 },
  ],
  specFields: [
    { key: "year", group: "condition", required: true, label: { en: "First registration", de: "Erstzulassung", tr: "İlk tescil", bg: "Първа регистрация" } },
    { key: "power", group: "engine", required: true, label: { en: "Power", de: "Leistung", tr: "Güç", bg: "Мощност" } },
    { key: "fuel", group: "engine", required: true, label: { en: "Fuel", de: "Kraftstoff", tr: "Yakıt", bg: "Гориво" } },
    { key: "gearbox", group: "engine", required: false, label: { en: "Gearbox", de: "Getriebe", tr: "Şanzıman", bg: "Скоростна кутия" } },
    { key: "colour", group: "body", required: false, label: { en: "Colour", de: "Farbe", tr: "Renk", bg: "Цвят" } },
    { key: "seats", group: "interior", required: false, label: { en: "Seats", de: "Sitze", tr: "Koltuklar", bg: "Седалки" } },
    { key: "mileage", group: "condition", required: false, label: { en: "Mileage", de: "Kilometerstand", tr: "Kilometre", bg: "Пробег" } },
  ],
  galleryTags: ["exterior", "interior", "seats", "dashboard", "controls", "mileage", "trunk", "wheels", "door", "details", "defects"],
  heroHighlights: ["year", "power", "fuel", "mileage"],
  detailsKey: null,
  detailsFields: [],
  schemaType: "Car",
  requestTypes: ["viewing", "testdrive", "question", "offer"],
} as const satisfies ProductTypeFields;
