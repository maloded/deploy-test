import type { CSSProperties } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { renderBlock, renderedBlocks } from "./blocks";
import type { Site } from "./blocks";

/**
 * The page frame for every product type: header strip, the blocks in the order of site.blocks (the product's, or
 * the type's default), footer. What differs per type (media ratios, spec groups, details) comes from the type's
 * descriptor in site.typeFields. A type that needs its own frame is registered in product-types/layouts.ts.
 */
export default function ProductLayout({ site }: { site: Site }) {
  const { media } = site.typeFields;
  return (
    <div
      className={`pt pt-${site.product.productType}`}
      data-lang={site.lang}
      data-block-order={renderedBlocks(site).join(" ")}
      style={{ "--media-ratio": media.heroRatio, "--gallery-ratio": media.galleryRatio } as CSSProperties}
    >
      <Header site={site} />
      <main>{site.blocks.map((id) => renderBlock(id, site))}</main>
      <Footer site={site} />
    </div>
  );
}
