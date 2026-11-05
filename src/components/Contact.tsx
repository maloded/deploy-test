import { contactWindowsOf, sellerZone } from "@/lib/contact-windows";
import { pick } from "@/lib/i18n";
import { offerBounds } from "@/lib/offer-amount";
import { allowedRequestTypes } from "@/lib/request-types";
import { prototypeNoteEnabled } from "@/lib/review";
import type { Site } from "./blocks";
import { ContactSection } from "./ContactSection";

/** The contact block: the footer's contact row (e-mail, phone, privacy and imprint links when set) and the dialog with the form. It has no button of its own. */
export function Contact({ site }: { site: Site }) {
  const { seller, lang } = site;
  return <ContactSection lang={lang} contactWindows={contactWindowsOf(seller)} timezone={sellerZone(site.viewing?.timezone, seller.timezone)} email={seller.contact.email} phone={seller.contact.phone} requestTypes={allowedRequestTypes(site.typeFields.requestTypes, site.viewing !== null)} viewing={site.viewing} offer={offerBounds(site.product.price.amount, site.product.offerAmount)} price={site.product.price.per === undefined && site.product.price.amount > 0 ? site.product.price.amount : null} currency={site.product.price.currency} prototypeNote={prototypeNoteEnabled()} consentText={pick(seller.consentText, lang)} privacyUrl={seller.privacyUrl} />;
}
