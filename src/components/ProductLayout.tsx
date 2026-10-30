import type { CSSProperties } from "react";
import { AgentWidget } from "./AgentWidget";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { renderBlock, renderedBlocks } from "./blocks";
import { presetFor } from "./request-presets";
import type { Site } from "./blocks";

/**
 * The page frame for every product type: header strip, the blocks in the order of site.blocks (the product's, or
 * the type's default; "contact" is the footer's row), footer. What differs per type (media ratios, spec groups, details) comes from the type's
 * descriptor in site.typeFields. A type that needs its own frame is registered in product-types/layouts.ts.
 */
export default function ProductLayout({ site }: { site: Site }) {
  const { media } = site.typeFields;
  const agent = site.seller.agent;
  const avatar = agent ? site.avatar : null; // with an avatar the card replaces every variant and placement
  const agentTop = agent && !avatar && agent.placement === "top" && agent.variant !== "floating" ? agent : null;
  // in the header only the compact pill fits: "inline" there is the bottom strip, "floating" ignores the placement
  const agentHeader = agent && !avatar && agent.placement === "header" && agent.variant === "pill" ? agent : null;
  return (
    <div
      className={`pt pt-${site.product.productType}`}
      data-lang={site.lang}
      data-block-order={renderedBlocks(site).join(" ")}
      style={{ "--media-ratio": media.heroRatio, "--gallery-ratio": media.galleryRatio, ...(agentHeader ? { "--header-h": "5.5rem" } : {}), ...(agentTop ? { "--agent-top-h": agentTop.variant === "inline" ? "7rem" : "3.5rem" } : {}) } as CSSProperties}
    >
      <Header site={site} agent={agentHeader} />
      {agentTop && <AgentWidget agent={agentTop} lang={site.lang} product={site.ref} />}
      {/* "contact" is rendered by the footer (its contact row), wherever the product lists it */}
      <main tabIndex={-1}>{site.blocks.filter((id) => id !== "contact").map((id) => renderBlock(id, site))}</main>
      {agent && !agentTop && !agentHeader && <AgentWidget agent={agent} lang={site.lang} product={site.ref} avatar={avatar} requestType={presetFor("header", site)} heroSlot={site.blocks.includes("hero")} />}
      <Footer site={site} />
    </div>
  );
}
