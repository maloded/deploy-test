import type { ReactNode } from "react";

export type StatusLanguage = { code: string; name: string; href: string };

/**
 * The 404 and error pages: the seller's name, a title, one sentence, the way back to the product page and, when there is more than one
 * language, a link per language. Plain markup with no server-only import, so the error boundaries (client components) can render it. It
 * shows no error message, no stack and no digest: it is only given the texts. `noindex` adds the robots meta tag for pages that cannot
 * export metadata (the error boundaries); the 404 page sets its own through its metadata.
 */
export function StatusPage({
  brand,
  title,
  text,
  homeHref,
  homeLabel,
  languages = [],
  languageLabel,
  noindex = false,
  children,
}: {
  brand: string;
  title: string;
  text: string;
  homeHref: string;
  homeLabel: string;
  languages?: StatusLanguage[];
  languageLabel?: string;
  noindex?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <main className="status-page">
        <div className="status-page__box">
          {brand && <p className="status-page__brand">{brand}</p>}
          <h1 className="status-page__title">{title}</h1>
          <p className="status-page__text">{text}</p>
          <div className="status-page__actions">
            {children}
            <a className="button" href={homeHref}>
              {homeLabel}
            </a>
          </div>
          {languages.length > 1 && (
            <nav className="status-page__languages" aria-label={languageLabel}>
              {languages.map((l) => (
                <a key={l.code} href={l.href} lang={l.code} hrefLang={l.code}>
                  {l.name}
                </a>
              ))}
            </nav>
          )}
        </div>
      </main>
    </>
  );
}
