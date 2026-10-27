import type { OfferTypeDef } from "@/lib/fields";

export const sale = {
  id: "sale",
  label: { en: "Sale", de: "Verkauf", ru: "Продажа", uk: "Продаж" },
  variant: "price",
  detailsKey: null,
  detailsFields: [],
  price: { per: "forbidden" },
} as const satisfies OfferTypeDef;
