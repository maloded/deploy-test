// Self-contained on purpose (like themes.ts): the ONE list of the languages the template supports. LANGUAGES, the zod
// checks, the switcher labels and the Intl calls all derive from it. To add a language, follow "Add a language" in PROJECT.md.

/** Font subsets a language needs; the theme fonts must ship a woff2 file for each (public/fonts/<theme>/, scripts/copy-fonts.mjs). */
export type FontSubset = "latin" | "cyrillic";

export type LanguageEntry = {
  /** The code used in seller.json, product.json and the URL: /<code>. */
  code: string;
  /** The language's own name, shown in the switcher. */
  name: string;
  /** BCP-47 locale for Intl (numbers, prices, dates). */
  locale: string;
  fontSubsets: readonly FontSubset[];
};

export const LANGUAGE_REGISTRY = [
  { code: "de", name: "Deutsch", locale: "de-DE", fontSubsets: ["latin"] },
  { code: "en", name: "English", locale: "en-GB", fontSubsets: ["latin"] },
] as const satisfies readonly LanguageEntry[];

export type Language = (typeof LANGUAGE_REGISTRY)[number]["code"];

export const LANGUAGES: readonly Language[] = LANGUAGE_REGISTRY.map((l) => l.code);

export const isLanguage = (value: unknown): value is Language => typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** The registry entry of a supported language. */
export function languageEntry(code: Language): (typeof LANGUAGE_REGISTRY)[number] {
  return LANGUAGE_REGISTRY.find((l) => l.code === code)!;
}

/** The Intl locale of a language. */
export const localeOf = (code: Language): string => languageEntry(code).locale;

/** The message for a language code outside the registry. */
export const unsupportedLanguageMessage = (code: unknown): string =>
  `unsupported language ${JSON.stringify(code)}. Supported languages: ${LANGUAGES.join(", ")} (to add one, see "Add a language" in PROJECT.md)`;
