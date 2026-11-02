import { groupSpecs } from "@/lib/specs";
import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";
import { SpecsGroups } from "./SpecsGroups";

/**
 * Specs grouped by the product type's spec groups: a label and a definition list per group. Everything is in the HTML. On a phone (below 900px) only the first
 * group is open and the others are collapsed rows that open with a tap, with a button that opens them all (SpecsGroups.tsx); wider screens show every group.
 */
export function Specs({ site }: { site: Site }) {
  const { lang } = site;
  const groups = groupSpecs(site.product.specs, site.typeFields, lang);
  if (groups.length === 0) return null;

  return (
    <section className="specs" id="specs" data-block="specs" aria-label={ui("section.specs", lang)}>
      <div className="container">
        <h2 className="section-title">{ui("section.specs", lang)}</h2>
        <SpecsGroups groups={groups} strings={{ other: ui("specs.other", lang), showAll: ui("specs.showAll", lang), showLess: ui("specs.showLess", lang) }} />
      </div>
    </section>
  );
}
