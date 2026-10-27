import type { Site } from "../blocks";
import { OfferShell } from "./parts";

/** Variant "price": a plain sale. */
export function OfferPrice({ site }: { site: Site }) {
  return <OfferShell site={site} disclaimer="default" />;
}
