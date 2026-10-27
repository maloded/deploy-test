import type { ComponentType } from "react";
import ProductLayout from "@/components/ProductLayout";
import type { Site } from "@/components/blocks";
import { getProductType } from "./index";

type LayoutModule = { default: ComponentType<{ site: Site }> };

/**
 * Type-specific layouts, loaded on demand. A product type that is not listed uses ProductLayout. To give a type its
 * own layout: create src/product-types/<type>/layout.tsx (default export, props { site }) and add one line here,
 * for example: `watch: () => import("./watch/layout"),`.
 */
const overrides: Record<string, () => Promise<LayoutModule>> = {};

export async function loadLayout(productType: string): Promise<ComponentType<{ site: Site }>> {
  getProductType(productType); // clear error for an unknown type
  return Object.hasOwn(overrides, productType) ? (await overrides[productType]()).default : ProductLayout;
}
