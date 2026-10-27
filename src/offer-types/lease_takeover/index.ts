import type { FieldDescriptor, InferFields, OfferTypeDef } from "@/lib/fields";

/** Money fields use price.currency. */
export const leaseFields = [
  { key: "termMonthsLeft", type: "number", int: true, min: 1, unit: "months", required: true, label: { en: "Months left", de: "Restlaufzeit" } },
  { key: "endDate", type: "date", required: true, label: { en: "Contract ends", de: "Vertragsende" } },
  { key: "takeoverFee", type: "number", min: 0, unit: "money", required: true, label: { en: "Takeover fee", de: "Übernahmegebühr" } },
  { key: "residualValue", type: "number", min: 0, unit: "money", required: true, label: { en: "Residual value at lease end", de: "Restwert bei Leasingende" } },
  { key: "mileageLimitPerYear", type: "number", int: true, min: 1, unit: "km", required: true, label: { en: "Mileage limit per year", de: "Kilometerlimit pro Jahr" } },
  { key: "mileageUsed", type: "number", int: true, min: 0, unit: "km", required: true, label: { en: "Mileage used so far", de: "Bisher gefahrene Kilometer" } },
  { key: "leasingCompany", type: "string", required: true, label: { en: "Leasing company", de: "Leasinggesellschaft" } },
  { key: "transferApprovalRequired", type: "boolean", required: true, label: { en: "Leasing company must approve the transfer", de: "Zustimmung der Leasinggesellschaft erforderlich" } },
  { key: "notes", type: "localized", required: false, label: { en: "Notes", de: "Hinweise" } },
] as const satisfies readonly FieldDescriptor[];

export type Lease = InferFields<typeof leaseFields>;

export const leaseTakeover = {
  id: "lease_takeover",
  label: { en: "Lease takeover", de: "Leasingübernahme" },
  variant: "lease",
  detailsKey: "lease",
  detailsFields: leaseFields,
  price: { per: "required" },
} as const satisfies OfferTypeDef;
