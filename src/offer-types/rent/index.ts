import type { FieldDescriptor, InferFields, OfferTypeDef } from "@/lib/fields";

/** Money fields use price.currency. depositMonths is a number of monthly rents. */
export const rentFields = [
  { key: "depositMonths", type: "number", min: 0, unit: "months", required: true, label: { en: "Deposit", de: "Kaution" } },
  { key: "minTermMonths", type: "number", int: true, min: 1, unit: "months", required: true, label: { en: "Minimum term", de: "Mindestmietdauer" } },
  { key: "utilitiesIncluded", type: "boolean", required: true, label: { en: "Utilities included", de: "Nebenkosten inklusive" } },
  { key: "availableFrom", type: "date", required: true, label: { en: "Available from", de: "Verfügbar ab" } },
  { key: "notes", type: "localized", required: false, label: { en: "Notes", de: "Hinweise" } },
] as const satisfies readonly FieldDescriptor[];

export type Rent = InferFields<typeof rentFields>;

export const rent = {
  id: "rent",
  label: { en: "Rent", de: "Miete" },
  variant: "rent",
  detailsKey: "rent",
  detailsFields: rentFields,
  price: { per: "required" },
} as const satisfies OfferTypeDef;
