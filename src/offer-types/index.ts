import type { OfferTypeDef } from "@/lib/fields";
import { leaseTakeover } from "./lease_takeover";
import { rent } from "./rent";
import { sale } from "./sale";

/** Names of the offer block variants that exist as components (src/components/offer). */
export const OFFER_VARIANTS = ["price", "lease", "rent"] as const;
export type OfferVariant = (typeof OFFER_VARIANTS)[number];

export const offerTypes = { sale, lease_takeover: leaseTakeover, rent } as const satisfies Record<string, OfferTypeDef>;
export type OfferTypeId = keyof typeof offerTypes;

export function getOfferType(id: string): OfferTypeDef {
  if (!Object.hasOwn(offerTypes, id)) {
    throw new Error(`Unknown offerType "${id}". Known offer types: ${Object.keys(offerTypes).join(", ")}.`);
  }
  return offerTypes[id as OfferTypeId];
}
