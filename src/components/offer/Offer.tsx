import type { OfferVariant } from "@/offer-types";
import type { Site } from "../blocks";
import { OfferLease } from "./OfferLease";
import { OfferPrice } from "./OfferPrice";
import { OfferRent } from "./OfferRent";

/** Shared offer block. The variant comes from the product's offer type and decides what is shown. */
export function Offer({ site, variant }: { site: Site; variant: OfferVariant }) {
  switch (variant) {
    case "lease":
      return <OfferLease site={site} />;
    case "rent":
      return <OfferRent site={site} />;
    default:
      return <OfferPrice site={site} />;
  }
}
