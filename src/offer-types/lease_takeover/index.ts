import type { FieldDescriptor, InferFields, OfferTypeDef } from "@/lib/fields";

/** Money fields use price.currency. */
export const leaseFields = [
  { key: "termMonthsLeft", type: "number", int: true, min: 1, unit: "months", required: true, label: { en: "Months left", de: "Restlaufzeit", tr: "Kalan süre", bg: "Оставащ срок" } },
  { key: "endDate", type: "date", required: true, label: { en: "Contract ends", de: "Vertragsende", tr: "Sözleşme bitişi", bg: "Край на договора" } },
  { key: "takeoverFee", type: "number", min: 0, unit: "money", required: true, label: { en: "Takeover fee", de: "Übernahmegebühr", tr: "Devir ücreti", bg: "Такса за прехвърляне" } },
  { key: "residualValue", type: "number", min: 0, unit: "money", required: true, label: { en: "Residual value at lease end", de: "Restwert bei Leasingende", tr: "Leasing sonundaki kalıntı değer", bg: "Остатъчна стойност в края на лизинга" } },
  { key: "mileageLimitPerYear", type: "number", int: true, min: 1, unit: "km", required: true, label: { en: "Mileage limit per year", de: "Kilometerlimit pro Jahr", tr: "Yıllık kilometre sınırı", bg: "Годишен километражен лимит" } },
  { key: "mileageUsed", type: "number", int: true, min: 0, unit: "km", required: true, label: { en: "Mileage used so far", de: "Bisher gefahrene Kilometer", tr: "Şimdiye kadar kullanılan kilometre", bg: "Изминати до момента километри" } },
  { key: "leasingCompany", type: "string", required: true, label: { en: "Leasing company", de: "Leasinggesellschaft", tr: "Leasing şirketi", bg: "Лизингова компания" } },
  { key: "transferApprovalRequired", type: "boolean", required: true, label: { en: "Leasing company must approve the transfer", de: "Zustimmung der Leasinggesellschaft erforderlich", tr: "Devir için leasing şirketinin onayı gerekir", bg: "За прехвърлянето е нужно одобрение на лизинговата компания" } },
  { key: "notes", type: "localized", required: false, label: { en: "Notes", de: "Hinweise", tr: "Notlar", bg: "Бележки" } },
] as const satisfies readonly FieldDescriptor[];

export type Lease = InferFields<typeof leaseFields>;

export const leaseTakeover = {
  id: "lease_takeover",
  label: { en: "Lease takeover", de: "Leasingübernahme", tr: "Leasing devri", bg: "Прехвърляне на лизинг" },
  variant: "lease",
  detailsKey: "lease",
  detailsFields: leaseFields,
  price: { per: "required" },
} as const satisfies OfferTypeDef;
