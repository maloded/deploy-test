import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";

/** Minimal header strip: the seller's brand on the left, primary button to #contact on the right. Not sticky. */
export function Header({ site }: { site: Site }) {
  const lang = site.product.defaultLanguage;
  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <span className="site-header__name">{site.seller.displayName}</span>
        <a className="button button--small" href="#contact">
          {ui("header.cta", lang)}
        </a>
      </div>
    </header>
  );
}
