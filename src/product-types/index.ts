import type { ProductTypeFields } from "@/lib/fields";
import { fields as base } from "./_base/fields";
import { fields as bag } from "./bag/fields";
import { fields as car } from "./car/fields";
import { fields as house } from "./house/fields";
import { fields as watch } from "./watch/fields";

/** productType -> its plain data. "other" uses _base. Layouts are in layouts.ts (React, loaded per type). */
export const productTypes = { car, house, watch, bag, other: base } as const satisfies Record<string, ProductTypeFields>;
export type ProductTypeId = keyof typeof productTypes;

export function getProductType(id: string): ProductTypeFields {
  if (!Object.hasOwn(productTypes, id)) {
    throw new Error(`Unknown productType "${id}". Known product types: ${Object.keys(productTypes).join(", ")}.`);
  }
  return productTypes[id as ProductTypeId];
}
