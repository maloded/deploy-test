import { pick } from "./i18n";
import type { Language, Localized } from "./schema";

/**
 * Every visible UI string (buttons, headings, disclaimers, footer). Product text comes from product.json.
 * English is the reference. The de texts are AI-WRITTEN DRAFTS: they have not been reviewed by
 * a native speaker and must be checked before release.
 */
export const AI_DRAFT_LANGUAGES = ["de"] as const;

const STRINGS = {
  "header.cta": { en: "Get in touch", de: "Kontakt aufnehmen" },
  "hero.cta": { en: "Request details", de: "Details anfragen" },
  "hero.specs": { en: "View specifications", de: "Technische Daten ansehen" },
  "hero.missing": { en: "Image missing", de: "Bild fehlt" },
  "section.hero": { en: "Overview", de: "Überblick" },
  "section.specs": { en: "Specifications", de: "Technische Daten" },
  "section.offer": { en: "Offer", de: "Angebot" },
  "section.faq": { en: "Questions and answers", de: "Fragen und Antworten" },
  "section.gallery": { en: "Photo gallery", de: "Fotogalerie" },
  "section.video": { en: "Video", de: "Video" },
  "gallery.previous": { en: "Previous photo", de: "Vorheriges Foto" },
  "gallery.next": { en: "Next photo", de: "Nächstes Foto" },
  "gallery.slide": { en: "{n} of {total}", de: "{n} von {total}" },
  "gallery.thumb": { en: "Show photo {n}", de: "Foto {n} anzeigen" },
  "gallery.open": { en: "Open photo {n} in full screen", de: "Foto {n} im Vollbild öffnen" },
  "lightbox.label": { en: "Photo viewer", de: "Fotoansicht" },
  "lightbox.close": { en: "Close", de: "Schließen" },
  "video.play": { en: "Play video", de: "Video abspielen" },
  "video.player": { en: "Video player", de: "Videoplayer" },
  "video.unsupported": {
    en: "Your browser cannot play this video.",
    de: "Ihr Browser kann dieses Video nicht abspielen.",
  },
  "specs.other": { en: "Other", de: "Sonstiges" },
  "offer.cta": { en: "Request details", de: "Details anfragen" },
  "offer.cta.offer": { en: "Make an offer", de: "Angebot machen" },
  "offer.disclaimer.lease": {
    en: "Lease terms are indicative and must be confirmed with the leasing company before any agreement is made.",
    de: "Die Leasingkonditionen sind unverbindlich und müssen vor Vertragsabschluss mit der Leasinggesellschaft bestätigt werden.",
  },
  "offer.disclaimer.default": {
    en: "Price and terms are indicative and must be confirmed before any agreement is made.",
    de: "Preis und Konditionen sind unverbindlich und müssen vor Vertragsabschluss bestätigt werden.",
  },
  "faq.toggle": { en: "Show or hide the answer", de: "Antwort ein- oder ausblenden" },
  "agent.heading": { en: "Talk to our voice assistant", de: "Sprechen Sie mit unserem Sprachassistenten" },
  "agent.start": { en: "Start call", de: "Gespräch starten" },
  "agent.top": { en: "Questions? Talk to our assistant.", de: "Fragen? Sprechen Sie mit unserem Assistenten." },
  "agent.pill": { en: "Talk to our assistant", de: "Mit unserem Assistenten sprechen" },
  "agent.end": { en: "End call", de: "Gespräch beenden" },
  "agent.connecting": { en: "Connecting...", de: "Verbindung wird aufgebaut..." },
  "footer.contact": { en: "Contact", de: "Kontakt" },
  "footer.privacy": { en: "Privacy", de: "Datenschutz" },
  "footer.imprint": { en: "Imprint", de: "Impressum" },
  "contact.title.offer": { en: "Make an offer", de: "Angebot machen" },
  "contact.title": { en: "Request details", de: "Details anfragen" },
  "contact.prototype": { en: "Prototype: requests are not delivered yet.", de: "Prototyp: Anfragen werden noch nicht zugestellt." },
  "contact.reassurance": { en: "Tell us how to reach you. We answer personally and without obligation.", de: "Sagen Sie uns, wie wir Sie erreichen. Wir antworten persönlich und unverbindlich." },
  "contact.requestType": { en: "What is this about?", de: "Worum geht es?" },
  "contact.name": { en: "Name", de: "Name" },
  "contact.email": { en: "E-mail", de: "E-Mail" },
  "contact.phone": { en: "Phone", de: "Telefon" },
  "contact.channel": { en: "Preferred channel", de: "Bevorzugter Kanal" },
  "contact.channel.none": { en: "No preference", de: "Keine Präferenz" },
  "contact.channel.email": { en: "E-mail", de: "E-Mail" },
  "contact.channel.phone": { en: "Phone", de: "Telefon" },
  "contact.channel.whatsapp": { en: "WhatsApp", de: "WhatsApp" },
  "contact.channel.telegram": { en: "Telegram", de: "Telegram" },
  "contact.bestTime": { en: "Best time to reach you", de: "Beste Erreichbarkeit" },
  "contact.message": { en: "Message", de: "Nachricht" },
  "contact.count": { en: "{n} of {max} characters", de: "{n} von {max} Zeichen" },
  "contact.optional": { en: "optional", de: "optional" },
  "contact.requiredNote": { en: "Fields marked * are required.", de: "Mit * markierte Felder sind Pflichtfelder." },
  "contact.consent": { en: "Consent", de: "Einwilligung" },
  "contact.privacy": { en: "Privacy", de: "Datenschutz" },
  "contact.hp": { en: "Leave this field empty", de: "Dieses Feld leer lassen" },
  "contact.submit": { en: "Send request", de: "Anfrage senden" },
  "contact.sending": { en: "Sending...", de: "Wird gesendet ..." },
  "contact.close": { en: "Close", de: "Schließen" },
  "contact.dialog": { en: "Contact form", de: "Kontaktformular" },
  "contact.mailto": { en: "Or write to us by e-mail:", de: "Oder schreiben Sie uns per E-Mail:" },
  "contact.error.summary": { en: "Please check these fields:", de: "Bitte prüfen Sie diese Felder:" },
  "contact.error.required": { en: "This field is required.", de: "Dieses Feld ist erforderlich." },
  "contact.error.email": { en: "Please enter a valid e-mail address.", de: "Bitte geben Sie eine gültige E-Mail-Adresse ein." },
  "contact.error.phone": { en: "Please enter a valid phone number.", de: "Bitte geben Sie eine gültige Telefonnummer ein." },
  "contact.error.max": { en: "Please use at most {max} characters.", de: "Bitte höchstens {max} Zeichen verwenden." },
  "contact.error.consent": { en: "Please agree to continue.", de: "Bitte stimmen Sie zu, um fortzufahren." },
  "contact.error.invalid": { en: "Some details could not be accepted. Please check the fields.", de: "Einige Angaben konnten nicht übernommen werden. Bitte prüfen Sie die Felder." },
  "contact.error.tooFast": { en: "That was very quick. Please wait a moment and send the form again.", de: "Das ging sehr schnell. Bitte warten Sie einen Moment und senden Sie das Formular erneut." },
  "contact.error.rate": { en: "Too many attempts. Please try again later or write to us directly.", de: "Zu viele Versuche. Bitte versuchen Sie es später erneut oder schreiben Sie uns direkt." },
  "contact.error.unavailable": { en: "Your request could not be sent and was not saved. Please write to us directly.", de: "Ihre Anfrage konnte nicht gesendet werden und wurde nicht gespeichert. Bitte schreiben Sie uns direkt." },
  "contact.preferredSlots": { en: "Preferred times", de: "Wunschtermine" },
  "contact.slots.address": { en: "Address", de: "Adresse" },
  "contact.slots.notes": { en: "Please bring", de: "Bitte mitbringen" },
  "contact.slots.hint": { en: "Choose up to {max} preferred times. We will confirm one by e-mail or phone.", de: "Wählen Sie bis zu {max} Wunschtermine. Wir bestätigen einen Termin per E-Mail oder telefonisch." },
  "contact.slots.available": { en: "Available: {days}, {from} to {to}.", de: "Möglich: {days}, {from} bis {to} Uhr." },
  "contact.slots.zone": { en: "Times are local time at the address ({zone}).", de: "Alle Zeiten gelten als Ortszeit am Standort ({zone})." },
  "contact.slots.date": { en: "Date {n}", de: "Datum {n}" },
  "contact.slots.time": { en: "Time {n}", de: "Uhrzeit {n}" },
  "contact.slots.select": { en: "Select a time", de: "Uhrzeit wählen" },
  "contact.slots.add": { en: "Add another time", de: "Weiteren Termin hinzufügen" },
  "contact.slots.remove": { en: "Remove time {n}", de: "Termin {n} entfernen" },
  "contact.error.slots": { en: "Please check the preferred times.", de: "Bitte prüfen Sie die Wunschtermine." },
  "contact.error.slotRequired": { en: "Please give at least one preferred time.", de: "Bitte geben Sie mindestens einen Wunschtermin an." },
  "contact.error.slot.missing": { en: "Please choose a date and a time.", de: "Bitte wählen Sie Datum und Uhrzeit." },
  "contact.error.slot.format": { en: "Please choose a date and a time.", de: "Bitte wählen Sie Datum und Uhrzeit." },
  "contact.error.slot.past": { en: "Please choose a day from tomorrow on.", de: "Bitte wählen Sie einen Tag ab morgen." },
  "contact.error.slot.horizon": { en: "Please choose a day within the next {max} days.", de: "Bitte wählen Sie einen Tag in den nächsten {max} Tagen." },
  "contact.error.slot.day": { en: "This day is not available. Available days: {days}.", de: "An diesem Tag ist kein Termin möglich. Mögliche Tage: {days}." },
  "contact.error.slot.time": { en: "Please choose one of the listed times.", de: "Bitte wählen Sie eine der angebotenen Uhrzeiten." },
  "contact.error.slot.nonexistent": { en: "Please choose one of the listed times.", de: "Bitte wählen Sie eine der angebotenen Uhrzeiten." },
  "contact.error.slot.duplicate": { en: "Please choose a different time for each entry.", de: "Bitte wählen Sie für jeden Eintrag einen anderen Termin." },
  "contact.success.viewing": { en: "Your request has been sent. We will confirm a time by e-mail or phone.", de: "Ihre Anfrage wurde gesendet. Wir bestätigen einen Termin per E-Mail oder telefonisch." },
  "contact.success.title": { en: "Thank you", de: "Vielen Dank" },
  "contact.success.text": { en: "Your request has been sent. We will get back to you.", de: "Ihre Anfrage wurde gesendet. Wir melden uns bei Ihnen." },
  "lang.switch": { en: "Language", de: "Sprache" },
  "footer.prototype": {
    en: "Prototype. Content is a draft and not yet confirmed by the seller.",
    de: "Prototyp. Die Inhalte sind ein Entwurf und noch nicht vom Verkäufer bestätigt.",
  },
} as const satisfies Record<string, Localized>;

export type UiKey = keyof typeof STRINGS;
export const UI_KEYS = Object.keys(STRINGS) as UiKey[];

export function ui(key: UiKey, lang: Language): string {
  return pick(STRINGS[key], lang);
}

/** A string with {name} placeholders filled in, for example uiFmt("gallery.slide", "en", { n: 3, total: 12 }). */
export function uiFmt(key: UiKey, lang: Language, vars: Record<string, string | number>): string {
  return ui(key, lang).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** The raw dictionary entry, for tests and tooling. */
export function uiEntry(key: UiKey): Localized {
  return STRINGS[key];
}
