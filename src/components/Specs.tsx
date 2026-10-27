import { groupSpecs } from "@/lib/specs";
import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";

/** Specs grouped by the product type's spec groups: a small label and a definition list per group. */
export function Specs({ site }: { site: Site }) {
  const { lang } = site;
  const groups = groupSpecs(site.product.specs, site.typeFields, lang);
  if (groups.length === 0) return null;

  return (
    <section className="specs" id="specs" data-block="specs" aria-label={ui("section.specs", lang)}>
      <div className="container">
        <h2 className="section-title">{ui("section.specs", lang)}</h2>
        <div className="specs__groups">
          {groups.map((g) => (
            <div className="specs__group" key={g.id} data-group={g.id}>
              <h3 className="label">{g.label ?? ui("specs.other", lang)}</h3>
              <dl className="details">
                {g.rows.map((r) => (
                  <div className="details__row" key={r.key}>
                    <dt className="details__label">{r.label}</dt>
                    <dd className="details__value">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
