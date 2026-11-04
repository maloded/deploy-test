import { pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import { indexingAllowed } from "@/lib/indexing";
import { currentVersion, versionLine, versionOnly } from "@/lib/version";
import { renderBlock, type Site } from "./blocks";

/**
 * The footer: the seller's brand and city, the contact block (heading, a link per request type the page offers, the e-mail, and the contact dialog), the agent's credit,
 * the seller's legal note and legal links (all from seller.json) and, when a music track's licence asks for it, the music credit line.
 */
/** The footer keeps room below its last line for what is fixed in the corner: the avatar card, or the floating pill. */
const footerClass = ({ seller, avatar }: Site): string =>
  seller.agent && avatar ? "site-footer site-footer--agent-card" : seller.agent?.variant === "floating" ? "site-footer site-footer--agent-floating" : "site-footer";

/** The credit lines of the product's music (only the tracks whose licence asks for one), each once, in track order. */
export function musicCredits(site: Site): { credit: string; url?: string }[] {
  const seen = new Set<string>();
  const out: { credit: string; url?: string }[] = [];
  for (const t of site.product.music?.tracks ?? []) {
    if (!t.credit) continue;
    const key = `${t.credit}\n${t.creditUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ credit: t.credit, url: t.creditUrl });
  }
  return out;
}

/** The footer's legal links, only the ones the seller gives (no dead link): privacy first, then the imprint. */
export function legalLinks(site: Site): { href: string; text: string }[] {
  const { seller, lang } = site;
  return [
    ...(seller.privacyUrl ? [{ href: seller.privacyUrl, text: ui("footer.privacy", lang) }] : []),
    ...(seller.imprintUrl ? [{ href: seller.imprintUrl, text: ui("footer.imprint", lang) }] : []),
  ];
}


function Badge({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

/**
 * The version line. In a RELEASE build (SITE_INDEXABLE=1, the switch that tells a release from a demo snapshot, see README "Demo vs release mode") only the
 * version, "v0.9.0"; in a demo or test snapshot and in development the full line (version, template and content commits, build time; "dev" without a version.json).
 */
export function footerVersionLine(info = currentVersion(), release = indexingAllowed()): string {
  return release ? versionOnly(info) : versionLine(info);
}

/**
 * Two rows of three columns, as wide as the header. Row 1: the seller's logo and name exactly as in the header with the city under it; the contact links in a
 * column; the assistant's badge on the right. A thin divider. Row 2: the non-binding note; the developer's badge; the legal links with the version line under them.
 * Everything is from the content; a badge or a link appears only when the content gives it. On a phone one column: logo and city, contacts, the assistant's badge,
 * the note, the developer's badge, the legal links, the version.
 */
export function Footer({ site }: { site: Site }) {
  const { seller, lang } = site;
  const credits = musicCredits(site);
  const city = seller.city ? pick(seller.city, lang) : null;
  const credit = seller.agent?.credit;
  const developer = seller.developer;
  // "GoodPoint Labs": all but the last word bold, the last one light (a single word is bold)
  const words = developer?.name.split(" ") ?? [];
  const legal = legalLinks(site);
  const version = footerVersionLine();
  return (
    <footer className={footerClass(site)} data-block="footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            {/* the header's own markup and classes: the same mark and wordmark in the theme's colours */}
            <span className="site-header__brand">
              {site.logo && <span className="site-header__logo" aria-hidden="true" dangerouslySetInnerHTML={{ __html: site.logo }} />}
              <span className="site-header__name">{seller.displayName}</span>
            </span>
            {city && <p className="site-footer__city">{city}</p>}
          </div>
          {renderBlock("contact", site)}
          {credit && (
            <Badge className="site-footer__badge site-footer__badge--agent" href={credit.url}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the brand emblem, a small SVG file of the template (public/brand), decorative */}
              <img className="site-footer__emblem" src="/brand/hanc-emblem.svg" alt="" width="32" height="32" />
              <span className="site-footer__badge-text">
                <small>{ui("footer.agentCredit", lang)}</small>
                <b>{credit.provider}</b>
              </span>
            </Badge>
          )}
        </div>
        <div className="site-footer__bottom">
          <div className="site-footer__notes">
            {seller.legalNote && <p className="site-footer__legal">{pick(seller.legalNote, lang)}</p>}
            {credits.length > 0 && (
              <p className="site-footer__credit">
                {ui("footer.music", lang)}{" "}
                {credits.map((c, i) => (
                  <span key={c.credit + (c.url ?? "")}>
                    {i > 0 && " · "}
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer">
                        {c.credit}
                      </a>
                    ) : (
                      c.credit
                    )}
                  </span>
                ))}
              </p>
            )}
          </div>
          {developer && (
            <Badge className="site-footer__badge site-footer__badge--developer" href={developer.url}>
              {site.developerIcon && <span className="site-footer__developer-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: site.developerIcon }} />}
              <span className="site-footer__badge-text">
                <small>{ui("footer.developedBy", lang)}</small>
                <b>
                  {words.slice(0, -1).join(" ") || developer.name}
                  {words.length > 1 && <em> {words[words.length - 1]}</em>}
                </b>
              </span>
            </Badge>
          )}
          <div className="site-footer__end">
            {legal.length > 0 && (
              <nav className="site-footer__legal-links" aria-label={ui("footer.legalLinks", lang)}>
                {legal.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    <a href={l.href}>{l.text}</a>
                  </span>
                ))}
              </nav>
            )}
            {version && <p className="site-footer__version">{version}</p>}
          </div>
        </div>
      </div>
    </footer>
  );
}
