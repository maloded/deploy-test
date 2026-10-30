const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * sitemap.xml for a one-page-per-language site: one <url> per language page, each with the alternates of every language (hreflang) and x-default.
 * Only what is known: the origin (SITE_URL), the languages and the default language; no lastmod, changefreq or priority (nothing in the data says them).
 */
export function sitemapXml({ origin, languages, defaultLanguage }: { origin: string; languages: readonly string[]; defaultLanguage: string }): string {
  const loc = (lang: string) => `${origin}/${lang}`;
  const alternates = languages.length > 1 ? [...languages.map((l) => ({ hreflang: l, href: loc(l) })), { hreflang: "x-default", href: loc(defaultLanguage) }] : [];
  const urls = languages.map(
    (lang) =>
      `  <url>\n    <loc>${esc(loc(lang))}</loc>\n` + alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}"/>\n`).join("") + "  </url>\n",
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("")}</urlset>\n`;
}
