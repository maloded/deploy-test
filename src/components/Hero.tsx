import Image from "next/image";
import type { CSSProperties } from "react";
import { objectPosition } from "@/lib/focus";
import { frameRangeForTheme, heroDescription, heroEyebrow, heroFacts, factPairs, heroFit, heroHeadline, heroMobile, splitLead } from "@/lib/hero";
import { heroThumbs } from "@/lib/hero-thumbs";
import { formatPrice, pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import { getOfferType } from "@/offer-types";
import type { Site } from "./blocks";
import { FactIcon } from "./fact-icons";
import { galleryProps } from "./gallery-props";
import { HeroFacts } from "./HeroFacts";
import { HeroThumbs } from "./HeroThumbs";
import { presetFor } from "./request-presets";
import { SofiaIntro } from "./SofiaIntro";

/**
 * Hero, one section. On wide, tall windows it is exactly one screen with three zones: the TITLE ZONE (eyebrow and
 * headline), the CENTER ZONE with the photo frame (it gets all the remaining height), and the BOTTOM ROW (the
 * intro columns). The title zone and the bottom row never depend on the photo. The frame depends only on the
 * window, and the photo is fitted into it by a rule decided here from the photo's display size: cover (with the
 * focus point) when its ratio is within reach of every frame ratio, else contain on a quiet matte (never cropped).
 * The price appears only in the bottom row.
 */
/**
 * A fact value of three words or more ("approx. 37,500 km") keeps its last two words together (a no-break space), so that where a phone's tile is too narrow the value
 * wraps after the first word ("approx." on its own line) and never inside "37,500 km". Two words ("150 PS") and one are left as they are.
 */
export function glueUnit(value: string): string {
  const words = value.split(" ");
  return words.length >= 3 ? `${words.slice(0, -2).join(" ")} ${words.slice(-2).join("\u00a0")}` : value;
}

export function Hero({ site }: { site: Site }) {
  const { product, images, typeFields } = site;
  const { lang } = site;
  const { amount, currency, per, note } = product.price;
  const image = images[product.media.hero];
  const background = product.media.background ? images[product.media.background] : undefined;
  const facts = heroFacts(product, typeFields, lang);
  const lead = splitLead(heroDescription(product, lang));
  const mobile = heroMobile(product, typeFields, lang);
  const hasCard = Boolean(site.seller.agent && site.avatar);
  const cutout = product.media.heroCutout === true;
  // a cut-out is never cropped (contain), and its backdrop is the theme's (see .hero__photo[data-cutout])
  const fit = image ? (cutout ? "contain" : heroFit(image.width, image.height, frameRangeForTheme(site.theme))) : "cover";

  // with the agent's card the left column has room beside the photo: the next two gallery photos after the hero one, as thumbnails that open the gallery
  // at that photo (the same deep link as /#gallery-N). Only when the page renders the gallery block.
  const thumbs = hasCard && site.blocks.includes("gallery") ? heroThumbs(galleryProps(site).slides, image?.src) : [];

  // the title zone: eyebrow, then headline and the photo frame
  const eyebrow = <p className="hero__eyebrow label">{heroEyebrow(product, lang, getOfferType(product.offerType).label)}</p>;
  const stage = (
    <>
      <h1 className="hero__headline">{heroHeadline(product, lang)}</h1>
      <div className="hero__photo" data-fit={fit} data-cutout={cutout ? "true" : undefined} data-thumbs={thumbs.length > 0 ? thumbs.length : undefined}>
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
        {thumbs.length > 0 && (
          <HeroThumbs>
            {thumbs.map((t) => (
              <a key={t.n} className="hero__thumb" href={`#gallery-${t.n}`} data-cutout={t.cutout ? "true" : undefined}>
                <Image className="hero__thumb-image" src={t.src} width={t.width} height={t.height} alt={t.alt} sizes="(min-width: 56em) 16rem, 0px" style={t.position ? { objectPosition: t.position } : undefined} />
              </a>
            ))}
          </HeroThumbs>
        )}
      </div>
    </>
  );

  return (
    <section className="hero" id="hero" data-block="hero" data-card={hasCard ? "true" : undefined} aria-label={ui("section.hero", lang)}>
      {background && (
        <Image className="hero__bg" src={background.src} alt="" aria-hidden="true" fill sizes="100vw" />
      )}

      {hasCard ? (
        // with the agent's card: the eyebrow stays above, centred, as it always was; below it only the headline and the photo form
        // the left column and the card's slot is the right one (below 56em the slot is a block under the photo). The slot only
        // reserves the room, the card itself is outside the hero (AgentAvatarCard).
        <>
          <div className="hero__lead-in hero__container">{eyebrow}</div>
          <div className="hero__top hero__container">
            <div className="hero__stage">{stage}</div>
            {/* the invitation and the slot form the right column (boxless on a phone, where each takes its place in the column of the section) */}
            <div className="hero__aside">
              <SofiaIntro site={site} />
              <div className="hero__slot" data-agent-slot aria-hidden="true" />
            </div>
          </div>
        </>
      ) : (
        <div className="hero__stage hero__container">
          {eyebrow}
          {stage}
        </div>
      )}

      <div className="hero__intro">
        <div className="hero__container">
          <div className="hero__intro-grid">
            <div className="hero__intro-main">
              <p className="hero__description">
                <span className="hero__lead">{lead.lead}</span>
                {lead.rest && ` ${lead.rest}`}
              </p>
              {facts.length > 0 && (
                <HeroFacts>
                  {factPairs(facts).map((pair, i) => (
                    <ul className="hero__facts-pair" data-count={pair.length} key={i}>
                      {pair.map((f, j) => (
                        <li className="hero__fact" key={f.label} style={{ "--i": i * 2 + j } as CSSProperties}>
                          <span className="hero__fact-value">{glueUnit(f.value)}</span>
                          <span className="hero__fact-label">
                            <FactIcon factKey={f.key} />
                            <span>{f.label}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ))}
                </HeroFacts>
              )}
            </div>

            <div className="hero__intro-aside">
              <div className="hero__pricebox">
                <p className="hero__figure">
                  {mobile.priceLabel && <span className="hero__price-label">{mobile.priceLabel}</span>}
                  <span className="hero__amount">{formatPrice(amount, currency, per, lang)}</span>
                  {note && <span className="hero__note">{pick(note, lang)}</span>}
                </p>
                <div className="hero__actions">
                  <a className="button" href="#contact" data-request-type={presetFor("hero", site)}>
                    {/* one button: the full text wide, the compact one on a phone (the other is display: none, so a reader hears one) */}
                    <span className="hero__cta-full">{ui("hero.cta", lang)}</span>
                    <span className="hero__cta-short">{mobile.shortCta}</span>
                  </a>
                  <a className="button button--outline" href="#specs">
                    {ui("hero.specs", lang)}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
