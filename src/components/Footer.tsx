import { pick } from "@/lib/i18n";
import { prototypeNoteEnabled } from "@/lib/review";
import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";

/**
 * Small footer: the seller's brand, contact, the privacy link and the seller's legal note (all from seller.json).
 * It carries id="contact" TEMPORARILY: the contact block (step 4) does not exist yet and the
 * "#contact" buttons need a target. Move the id to the contact section in step 4.
 */
export function Footer({ site }: { site: Site }) {
  const { product, seller } = site;
  const lang = product.defaultLanguage;
  return (
    <footer className="site-footer" id="contact" data-block="footer">
      <div className="site-footer__inner container">
        <p className="site-footer__name">{seller.displayName}</p>
        <p className="site-footer__row">
          <span>{ui("footer.contact", lang)}: </span>
          <a href={`mailto:${seller.contact.email}`}>{seller.contact.email}</a>
          <span aria-hidden="true"> · </span>
          <a href={seller.privacyUrl ?? "#privacy"}>{ui("footer.privacy", lang)}</a>
        </p>
        {seller.legalNote && <p className="site-footer__legal">{pick(seller.legalNote, lang)}</p>}
        {prototypeNoteEnabled() && <p className="site-footer__prototype">{ui("footer.prototype", lang)}</p>}
      </div>
    </footer>
  );
}
