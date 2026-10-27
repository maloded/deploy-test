import { leaseFields } from "@/offer-types/lease_takeover";
import type { Site } from "../blocks";
import { DetailsList, OfferShell } from "./parts";

/** Variant "lease": price per period plus the lease terms from product.lease. */
export function OfferLease({ site }: { site: Site }) {
  return (
    <OfferShell site={site} disclaimer="lease">
      <DetailsList site={site} fields={leaseFields} values={site.product.lease} />
    </OfferShell>
  );
}
