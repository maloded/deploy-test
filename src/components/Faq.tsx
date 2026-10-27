import { pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";

/** FAQ as native <details>/<summary>: works without JavaScript. The plus/minus is drawn with CSS. */
export function Faq({ site }: { site: Site }) {
  const { faq } = site.product;
  const { lang } = site;
  if (faq.length === 0) return null;

  return (
    <section className="faq" id="faq" data-block="faq" aria-label={ui("section.faq", lang)}>
      <div className="container">
        <h2 className="section-title">{ui("section.faq", lang)}</h2>
        <div className="faq__list">
          {faq.map((item, i) => (
            <details className="faq__item" key={i}>
              <summary className="faq__question" title={ui("faq.toggle", lang)}>
                <span>{pick(item.q, lang)}</span>
                <span className="faq__icon" aria-hidden="true" />
              </summary>
              <p className="faq__answer">{pick(item.a, lang)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
