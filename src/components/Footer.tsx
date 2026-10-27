import { pick } from "@/lib/i18n";
import { prototypeNoteEnabled } from "@/lib/review";
import { ui } from "@/lib/ui-strings";
import { renderBlock, type Site } from "./blocks";

/**
 * Small footer: the seller's brand, the contact row (the "contact" block: e-mail, phone, privacy and imprint links, and the
 * contact dialog) and the seller's legal note (all from seller.json).
 */
export function Footer({ site }: { site: Site }) {
  const { seller, lang } = site;
  return (
    <footer className="site-footer" data-block="footer">
      <div className="site-footer__inner container">
        <p className="site-footer__name">{seller.displayName}</p>
        {renderBlock("contact", site)}
        {seller.legalNote && <p className="site-footer__legal">{pick(seller.legalNote, lang)}</p>}
        {prototypeNoteEnabled() && <p className="site-footer__prototype">{ui("footer.prototype", lang)}</p>}
      </div>
    </footer>
  );
}
