import { pick } from "@/lib/i18n";
import { prototypeNoteEnabled } from "@/lib/review";
import { ui } from "@/lib/ui-strings";
import { currentVersion, versionLine } from "@/lib/version";
import { renderBlock, type Site } from "./blocks";

/**
 * Small footer: the seller's brand, the contact row (the "contact" block: e-mail, phone, privacy and imprint links, and the
 * contact dialog) and the seller's legal note (all from seller.json).
 */
/** The footer keeps room below its last line for what is fixed in the corner: the avatar card, or the floating pill. */
const footerClass = ({ seller, avatar }: Site): string =>
  seller.agent && avatar ? "site-footer site-footer--agent-card" : seller.agent?.variant === "floating" ? "site-footer site-footer--agent-floating" : "site-footer";

export function Footer({ site }: { site: Site }) {
  const { seller, lang } = site;
  return (
    <footer className={footerClass(site)} data-block="footer">
      <div className="site-footer__inner container">
        <p className="site-footer__name">{seller.displayName}</p>
        {renderBlock("contact", site)}
        {seller.legalNote && <p className="site-footer__legal">{pick(seller.legalNote, lang)}</p>}
        {prototypeNoteEnabled() && <p className="site-footer__prototype">{ui("footer.prototype", lang)}</p>}
        {prototypeNoteEnabled() && <p className="site-footer__version">{versionLine(currentVersion())}</p>}
      </div>
    </footer>
  );
}
