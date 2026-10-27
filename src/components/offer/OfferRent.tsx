import { rentFields } from "@/offer-types/rent";
import type { Site } from "../blocks";
import { DetailsList, OfferShell } from "./parts";

/** Variant "rent": rent per period plus the terms from product.rent. */
export function OfferRent({ site }: { site: Site }) {
  return (
    <OfferShell site={site} disclaimer="default">
      <DetailsList site={site} fields={rentFields} values={site.product.rent} />
    </OfferShell>
  );
}
