// The few texts of the 404 and error pages, in one small module: the client components (error boundaries) import only this, not the whole
// UI string bundle. ui-strings.ts spreads them into STRINGS, so ui(key, lang) and the completeness tests cover them like every other string.
import { pick } from "./i18n";
import type { Language, Localized } from "./schema";

export const STATUS_STRINGS = {
  "notfound.title": { en: "Page not found", de: "Seite nicht gefunden" },
  "notfound.text": { en: "The page you are looking for does not exist.", de: "Die gesuchte Seite gibt es nicht." },
  "page.back": { en: "Back to the page", de: "Zurück zur Seite" },
  "error.title": { en: "Something went wrong", de: "Etwas ist schiefgelaufen" },
  "error.text": { en: "Please try again in a moment.", de: "Bitte versuchen Sie es gleich noch einmal." },
  "error.retry": { en: "Try again", de: "Erneut versuchen" },
} as const satisfies Record<string, Localized>;

export type StatusKey = keyof typeof STATUS_STRINGS;

export const statusText = (key: StatusKey, lang: Language): string => pick(STATUS_STRINGS[key], lang);
