import type { ProductTypeFields } from "@/lib/fields";

/** Plain data only (no functions). "other" products use this type. The type folders are copies of it. */
export const fields = {
  id: "_base",
  label: { en: "Other", de: "Sonstiges" },
  allowedOfferTypes: ["sale", "lease_takeover", "rent"],
  media: { heroRatio: "3 / 2", galleryRatio: "3 / 2" },
  specGroups: [{ id: "general", label: { en: "General", de: "Allgemein" }, order: 1 }],
  specFields: [],
  galleryTags: [],
  heroHighlights: [],
  detailsKey: null,
  detailsFields: [],
  requestTypes: ["question", "offer"],
} as const satisfies ProductTypeFields;
