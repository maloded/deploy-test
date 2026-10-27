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
  "offer.disclaimer.lease": {
    en: "Lease terms are indicative and must be confirmed with the leasing company before any agreement is made.",
    de: "Die Leasingkonditionen sind unverbindlich und müssen vor Vertragsabschluss mit der Leasinggesellschaft bestätigt werden.",
  },
  "offer.disclaimer.default": {
    en: "Price and terms are indicative and must be confirmed before any agreement is made.",
    de: "Preis und Konditionen sind unverbindlich und müssen vor Vertragsabschluss bestätigt werden.",
  },
  "faq.toggle": { en: "Show or hide the answer", de: "Antwort ein- oder ausblenden" },
  "footer.contact": { en: "Contact", de: "Kontakt" },
  "footer.privacy": { en: "Privacy", de: "Datenschutz" },
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
