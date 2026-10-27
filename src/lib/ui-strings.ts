import { pick } from "./i18n";
import type { Language, Localized } from "./schema";

/**
 * Every visible UI string (buttons, headings, disclaimers, footer). Product text comes from product.json.
 * English is the reference. The de, ru and uk texts are AI-WRITTEN DRAFTS: they have not been reviewed by
 * a native speaker and must be checked before release.
 */
export const AI_DRAFT_LANGUAGES = ["de", "ru", "uk"] as const;

const STRINGS = {
  "header.cta": { en: "Get in touch", de: "Kontakt aufnehmen", ru: "Связаться", uk: "Зв’язатися" },
  "hero.cta": { en: "Request details", de: "Details anfragen", ru: "Запросить подробности", uk: "Запитати деталі" },
  "hero.specs": { en: "View specifications", de: "Technische Daten ansehen", ru: "Посмотреть характеристики", uk: "Переглянути характеристики" },
  "hero.missing": { en: "Image missing", de: "Bild fehlt", ru: "Нет изображения", uk: "Немає зображення" },
  "section.hero": { en: "Overview", de: "Überblick", ru: "Обзор", uk: "Огляд" },
  "section.specs": { en: "Specifications", de: "Technische Daten", ru: "Характеристики", uk: "Характеристики" },
  "section.offer": { en: "Offer", de: "Angebot", ru: "Предложение", uk: "Пропозиція" },
  "section.faq": { en: "Questions and answers", de: "Fragen und Antworten", ru: "Вопросы и ответы", uk: "Запитання та відповіді" },
  "section.gallery": { en: "Photo gallery", de: "Fotogalerie", ru: "Фотогалерея", uk: "Фотогалерея" },
  "section.video": { en: "Video", de: "Video", ru: "Видео", uk: "Відео" },
  "gallery.previous": { en: "Previous photo", de: "Vorheriges Foto", ru: "Предыдущее фото", uk: "Попереднє фото" },
  "gallery.next": { en: "Next photo", de: "Nächstes Foto", ru: "Следующее фото", uk: "Наступне фото" },
  "gallery.slide": { en: "{n} of {total}", de: "{n} von {total}", ru: "{n} из {total}", uk: "{n} з {total}" },
  "gallery.thumb": { en: "Show photo {n}", de: "Foto {n} anzeigen", ru: "Показать фото {n}", uk: "Показати фото {n}" },
  "gallery.open": { en: "Open photo {n} in full screen", de: "Foto {n} im Vollbild öffnen", ru: "Открыть фото {n} на весь экран", uk: "Відкрити фото {n} на весь екран" },
  "lightbox.label": { en: "Photo viewer", de: "Fotoansicht", ru: "Просмотр фото", uk: "Перегляд фото" },
  "lightbox.close": { en: "Close", de: "Schließen", ru: "Закрыть", uk: "Закрити" },
  "video.play": { en: "Play video", de: "Video abspielen", ru: "Воспроизвести видео", uk: "Відтворити відео" },
  "video.player": { en: "Video player", de: "Videoplayer", ru: "Видеоплеер", uk: "Відеоплеєр" },
  "video.unsupported": {
    en: "Your browser cannot play this video.",
    de: "Ihr Browser kann dieses Video nicht abspielen.",
    ru: "Ваш браузер не может воспроизвести это видео.",
    uk: "Ваш браузер не може відтворити це відео.",
  },
  "specs.other": { en: "Other", de: "Sonstiges", ru: "Прочее", uk: "Інше" },
  "offer.cta": { en: "Request details", de: "Details anfragen", ru: "Запросить подробности", uk: "Запитати деталі" },
  "offer.disclaimer.lease": {
    en: "Lease terms are indicative and must be confirmed with the leasing company before any agreement is made.",
    de: "Die Leasingkonditionen sind unverbindlich und müssen vor Vertragsabschluss mit der Leasinggesellschaft bestätigt werden.",
    ru: "Условия лизинга ориентировочные и должны быть подтверждены лизинговой компанией до заключения любого соглашения.",
    uk: "Умови лізингу орієнтовні й мають бути підтверджені лізинговою компанією до укладення будь-якої угоди.",
  },
  "offer.disclaimer.default": {
    en: "Price and terms are indicative and must be confirmed before any agreement is made.",
    de: "Preis und Konditionen sind unverbindlich und müssen vor Vertragsabschluss bestätigt werden.",
    ru: "Цена и условия ориентировочные и должны быть подтверждены до заключения любого соглашения.",
    uk: "Ціна й умови орієнтовні та мають бути підтверджені до укладення будь-якої угоди.",
  },
  "faq.toggle": { en: "Show or hide the answer", de: "Antwort ein- oder ausblenden", ru: "Показать или скрыть ответ", uk: "Показати або сховати відповідь" },
  "footer.contact": { en: "Contact", de: "Kontakt", ru: "Контакты", uk: "Контакти" },
  "footer.privacy": { en: "Privacy", de: "Datenschutz", ru: "Конфиденциальность", uk: "Конфіденційність" },
  "footer.prototype": {
    en: "Prototype. Content is a draft and not yet confirmed by the seller.",
    de: "Prototyp. Die Inhalte sind ein Entwurf und noch nicht vom Verkäufer bestätigt.",
    ru: "Прототип. Содержание — черновик и ещё не подтверждено продавцом.",
    uk: "Прототип. Зміст є чернеткою і ще не підтверджений продавцем.",
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
