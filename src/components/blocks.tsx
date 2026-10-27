import type { ReactNode } from "react";
import { BLOCKS, type BlockId } from "@/lib/schema";
import type { buildSite } from "@/lib/site";
import { OFFER_VARIANTS, getOfferType, type OfferVariant } from "@/offer-types";
import { Faq } from "./Faq";
import { Gallery } from "./Gallery";
import { galleryProps } from "./gallery-props";
import { Hero } from "./Hero";
import { Specs } from "./Specs";
import { Video } from "./Video";
import { Offer } from "./offer/Offer";

export type Site = ReturnType<typeof buildSite>;

/** Whether a block produces output for this product (an empty specs or faq list renders nothing). */
export function isRendered(id: BlockId, site: Site): boolean {
  if (!BLOCKS[id]) return false;
  if (id === "gallery") return galleryProps(site).slides.length > 0;
  if (id === "video") return site.product.media.video !== null;
  if (id === "specs") return site.product.specs.length > 0;
  if (id === "faq") return site.product.faq.length > 0;
  return true;
}

/** Block ids that render, in page order. Published as data-block-order on the page root. */
export function renderedBlocks(site: Site): BlockId[] {
  return site.blocks.filter((id) => isRendered(id, site));
}

function offerVariant(site: Site): OfferVariant {
  const variant = getOfferType(site.product.offerType).variant;
  return (OFFER_VARIANTS as readonly string[]).includes(variant) ? (variant as OfferVariant) : "price";
}

export function renderBlock(id: BlockId, site: Site): ReactNode {
  if (!isRendered(id, site)) return null;
  switch (id) {
    case "hero":
      return <Hero key={id} site={site} />;
    case "gallery":
      return <Gallery key={id} {...galleryProps(site)} />;
    case "video":
      return <Video key={id} site={site} />;
    case "specs":
      return <Specs key={id} site={site} />;
    case "offer":
      return <Offer key={id} site={site} variant={offerVariant(site)} />;
    case "faq":
      return <Faq key={id} site={site} />;
    default:
      return null;
  }
}
