import type { ReactNode } from "react";
import type { FieldDescriptor } from "@/lib/fields";
import { formatFieldValue, formatPrice, pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import { getOfferType } from "@/offer-types";
import type { Site } from "../blocks";

/**
 * Common frame of every offer variant: label, large price, price note, optional details, one primary
 * button and a neutral disclaimer. With details it is a two-column centerpiece on wide screens.
 */
export function OfferShell({
  site,
  disclaimer,
  children,
}: {
  site: Site;
  disclaimer: "lease" | "default";
  children?: ReactNode;
}) {
  const { product } = site;
  const lang = product.defaultLanguage;
  const { amount, currency, per, note } = product.price;
  return (
    <section className="offer" id="offer" data-block="offer" aria-label={ui("section.offer", lang)}>
      <div className="offer__inner container">
        <div className={`offer__columns${children ? " offer__columns--split" : ""}`}>
          <div className="offer__main">
            <p className="label">{ui("section.offer", lang)}</p>
            <h2 className="offer__title">{pick(getOfferType(product.offerType).label, lang)}</h2>
            <p className="offer__price">{formatPrice(amount, currency, per, lang)}</p>
            {note && <p className="offer__note">{pick(note, lang)}</p>}
            <p className="offer__action">
              <a className="button" href="#contact">
                {ui("offer.cta", lang)}
              </a>
            </p>
          </div>
          {children && <div className="offer__details">{children}</div>}
        </div>
        <p className="offer__disclaimer">{ui(`offer.disclaimer.${disclaimer}`, lang)}</p>
      </div>
    </section>
  );
}

/** Label/value rows for a details object (lease, rent, ...). Only fields present in the data are shown. */
export function DetailsList({
  site,
  fields,
  values,
}: {
  site: Site;
  fields: readonly FieldDescriptor[];
  values: Record<string, unknown> | undefined;
}) {
  const lang = site.product.defaultLanguage;
  const rows = fields.filter((f) => values?.[f.key] !== undefined);
  return (
    <dl className="details">
      {rows.map((f) => (
        <div className="details__row" key={f.key} data-field={f.key}>
          <dt className="details__label">{pick(f.label, lang)}</dt>
          <dd className="details__value">{formatFieldValue(f, values?.[f.key], lang, site.product.price.currency)}</dd>
        </div>
      ))}
    </dl>
  );
}
