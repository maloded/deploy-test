import Image from "next/image";
import { objectPosition } from "@/lib/focus";
import { frameRangeForTheme, heroDescription, heroEyebrow, heroFacts, heroFit, heroHeadline, heroTrust } from "@/lib/hero";
import { formatPrice, pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import { getOfferType } from "@/offer-types";
import type { Site } from "./blocks";

/**
 * Hero, one section. On wide, tall windows it is exactly one screen with three zones: the TITLE ZONE (eyebrow and
 * headline), the CENTER ZONE with the photo frame (it gets all the remaining height), and the BOTTOM ROW (the
 * intro columns). The title zone and the bottom row never depend on the photo. The frame depends only on the
 * window, and the photo is fitted into it by a rule decided here from the photo's display size: cover (with the
 * focus point) when its ratio is within reach of every frame ratio, else contain on a quiet matte (never cropped).
 * The price appears only in the bottom row.
 */
export function Hero({ site }: { site: Site }) {
  const { product, images, typeFields } = site;
  const { lang } = site;
  const { amount, currency, per, note } = product.price;
  const image = images[product.media.hero];
  const background = product.media.background ? images[product.media.background] : undefined;
  const facts = heroFacts(product, typeFields, lang);
  const trust = heroTrust(product, lang);
  const fit = image ? heroFit(image.width, image.height, frameRangeForTheme(site.theme)) : "cover";

  return (
    <section className="hero" id="hero" data-block="hero" aria-label={ui("section.hero", lang)}>
      {background && (
        <Image className="hero__bg" src={background.src} alt="" aria-hidden="true" fill sizes="100vw" />
      )}

      <div className="hero__stage hero__container">
        <p className="hero__eyebrow label">{heroEyebrow(product, lang, getOfferType(product.offerType).label)}</p>
        <h1 className="hero__headline">{heroHeadline(product, lang)}</h1>
        <div className="hero__photo" data-fit={fit}>
          <div className="hero__frame">
            <div className="hero__box">
              {image ? (
                <Image
                  className="hero__image"
                  src={image.src}
                  width={image.width}
                  height={image.height}
                  alt={pick(product.title, lang)}
                  sizes="(min-width: 56em) 720px, 100vw"
                  // the focus point only matters when the photo is cropped (cover); contain is centered
                  style={fit === "cover" ? { objectPosition: objectPosition(product.media.heroFocus) } : undefined}
                  // 85, not the default 75: the hero and gallery photo 1 may be the same file, and next/image's
                  // development check (LCP warning) tells images apart by their address, which includes the quality
                  quality={85}
                  priority
                />
              ) : (
                <div className="hero__placeholder" role="img" aria-label={ui("hero.missing", lang)}>
                  {ui("hero.missing", lang)}: {product.media.hero}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hero__intro">
        <div className="hero__container">
          <div className="hero__intro-grid">
            <div className="hero__intro-main">
              <p className="hero__description">{heroDescription(product, lang)}</p>
              {facts.length > 0 && (
                <ul className="hero__facts">
                  {facts.map((f) => (
                    <li className="hero__fact" key={f.label}>
                      <span className="hero__fact-value">{f.value}</span>
                      <span className="hero__fact-label">{f.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="hero__intro-aside">
              <p className="hero__figure">
                <span className="hero__amount">{formatPrice(amount, currency, per, lang)}</span>
                {note && <span className="hero__note">{pick(note, lang)}</span>}
              </p>
              <div className="hero__actions">
                <a className="button" href="#contact">
                  {ui("hero.cta", lang)}
                </a>
                <a className="button button--outline" href="#specs">
                  {ui("hero.specs", lang)}
                </a>
              </div>
            </div>
          </div>
          {trust.length > 0 && (
            <ul className="hero__trust">
              {trust.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
