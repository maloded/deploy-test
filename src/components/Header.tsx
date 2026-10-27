import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { presetFor } from "./request-presets";

/**
 * Header strip: the seller's brand on the left; on the right the language switcher (only when the seller offers more
 * than one language) and the primary button to #contact. Not sticky.
 */
export function Header({ site }: { site: Site }) {
  const { lang } = site;
  const { languages } = site.product;
  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <span className="site-header__name">{site.seller.displayName}</span>
        <div className="site-header__end">
          {languages.length > 1 && <LanguageSwitcher languages={languages} current={lang} label={ui("lang.switch", lang)} />}
          <a className="button button--small" href="#contact" data-request-type={presetFor("header", site)}>
            {ui("header.cta", lang)}
          </a>
        </div>
      </div>
    </header>
  );
}
