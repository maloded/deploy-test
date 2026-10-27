import { pick } from "./i18n";
import type { ProductTypeFields } from "./fields";
import type { Language, Product } from "./schema";

export type SpecRow = { key: string; label: string; value: string };
export type SpecGroupView = { id: string; label: string | null; rows: SpecRow[] };

/**
 * Specs grouped by the product type's spec groups, in the type's order. Specs without a group, or with a
 * group the type does not know, go into a trailing "other" group (label null: the caller supplies the text).
 * Empty groups are left out.
 */
export function groupSpecs(specs: Product["specs"], type: ProductTypeFields, lang: Language): SpecGroupView[] {
  const known = [...type.specGroups].sort((a, b) => a.order - b.order);
  const row = (s: Product["specs"][number]): SpecRow => ({
    key: s.key,
    label: pick(s.label, lang),
    value: pick(s.value, lang),
  });

  const groups: SpecGroupView[] = known.map((g) => ({
    id: g.id,
    label: pick(g.label, lang),
    rows: specs.filter((s) => s.group === g.id).map(row),
  }));
  const other = specs.filter((s) => !s.group || !known.some((g) => g.id === s.group)).map(row);

  return [...groups, { id: "other", label: null, rows: other }].filter((g) => g.rows.length > 0);
}
