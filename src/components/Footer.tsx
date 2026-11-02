import { pick } from "@/lib/i18n";
import { prototypeNoteEnabled } from "@/lib/review";
import { ui } from "@/lib/ui-strings";
import { currentVersion, versionLine } from "@/lib/version";
import { renderBlock, type Site } from "./blocks";

/**
 * Small footer: the seller's brand, the contact row (the "contact" block: e-mail, phone, privacy and imprint links, and the
 * contact dialog), the seller's legal note (all from seller.json) and, when a music track's licence asks for it, the music credit line.
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

export function Footer({ site }: { site: Site }) {
  const { seller, lang } = site;
  const credits = musicCredits(site);
  return (
    <footer className={footerClass(site)} data-block="footer">
      <div className="site-footer__inner container">
        <p className="site-footer__name">{seller.displayName}</p>
        {renderBlock("contact", site)}
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
        {prototypeNoteEnabled() && <p className="site-footer__prototype">{ui("footer.prototype", lang)}</p>}
        {prototypeNoteEnabled() && <p className="site-footer__version">{versionLine(currentVersion())}</p>}
      </div>
    </footer>
  );
}
