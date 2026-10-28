import { contactWindowsOf, sellerZone } from "@/lib/contact-windows";
import { pick } from "@/lib/i18n";
import { allowedRequestTypes } from "@/lib/request-types";
import { prototypeNoteEnabled } from "@/lib/review";
import type { Site } from "./blocks";
import { ContactSection } from "./ContactSection";

/** The contact block: the footer's contact row (e-mail, phone, privacy and imprint links when set) and the dialog with the form. It has no button of its own. */
export function Contact({ site }: { site: Site }) {
  const { seller, lang } = site;
  return <ContactSection lang={lang} contactWindows={contactWindowsOf(seller)} timezone={sellerZone(site.viewing?.timezone, seller.timezone)} email={seller.contact.email} phone={seller.contact.phone} requestTypes={allowedRequestTypes(site.typeFields.requestTypes, site.viewing !== null)} viewing={site.viewing} prototypeNote={prototypeNoteEnabled()} consentText={pick(seller.consentText, lang)} privacyUrl={seller.privacyUrl} imprintUrl={seller.imprintUrl} />;
}
