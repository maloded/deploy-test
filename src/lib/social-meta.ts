import { localeOf, LANGUAGES, type Language } from "./languages";

/** The Open Graph locale of a language: the registry's BCP-47 locale with an underscore (de-DE becomes de_DE). */
export const ogLocale = (lang: Language): string => localeOf(lang).replace("-", "_");

export type SocialImage = { url: string; width: number; height: number; alt: string };

/**
 * Open Graph and Twitter card for one language page. Every value is the page's own (title, description, language, the seller's name);
 * nothing is invented. `url` is set only when the site's origin is known (metadataBase): a relative URL would resolve against nowhere.
 * The card is summary_large_image only with an image; a large card without one is not valid, so it falls back to summary.
 */
export function socialMeta({ lang, languages, title, description, siteName, withUrl, image }: { lang: Language; languages: readonly Language[]; title: string; description: string; siteName: string; withUrl: boolean; image?: SocialImage | null }) {
  const others = languages.filter((l) => l !== lang && LANGUAGES.includes(l));
  return {
    openGraph: {
      type: "website" as const,
      siteName,
      title,
      description,
      locale: ogLocale(lang),
      ...(others.length ? { alternateLocale: others.map(ogLocale) } : {}),
      ...(withUrl ? { url: `/${lang}` } : {}),
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? ("summary_large_image" as const) : ("summary" as const),
      title,
      description,
      ...(image ? { images: [{ url: image.url, alt: image.alt }] } : {}),
    },
  };
}
