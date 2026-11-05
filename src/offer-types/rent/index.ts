import type { FieldDescriptor, InferFields, OfferTypeDef } from "@/lib/fields";

/** Money fields use price.currency. depositMonths is a number of monthly rents. */
export const rentFields = [
  { key: "depositMonths", type: "number", min: 0, unit: "months", required: true, label: { en: "Deposit", de: "Kaution", tr: "Depozito", bg: "Депозит" } },
  { key: "minTermMonths", type: "number", int: true, min: 1, unit: "months", required: true, label: { en: "Minimum term", de: "Mindestmietdauer", tr: "Asgari kiralama süresi", bg: "Минимален срок на наема" } },
  { key: "utilitiesIncluded", type: "boolean", required: true, label: { en: "Utilities included", de: "Nebenkosten inklusive", tr: "Aidat ve giderler dâhil", bg: "Режийните са включени" } },
  { key: "availableFrom", type: "date", required: true, label: { en: "Available from", de: "Verfügbar ab", tr: "Müsait olduğu tarih", bg: "Налично от" } },
  { key: "notes", type: "localized", required: false, label: { en: "Notes", de: "Hinweise", tr: "Notlar", bg: "Бележки" } },
] as const satisfies readonly FieldDescriptor[];

export type Rent = InferFields<typeof rentFields>;

export const rent = {
  id: "rent",
  label: { en: "Rent", de: "Miete", tr: "Kira", bg: "Наем" },
  variant: "rent",
  detailsKey: "rent",
  detailsFields: rentFields,
  price: { per: "required" },
} as const satisfies OfferTypeDef;
