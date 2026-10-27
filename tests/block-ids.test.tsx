// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { renderBlock, renderedBlocks } from "@/components/blocks";
import { defaultBlocksFor } from "@/lib/fields";
import { BLOCKS, BLOCK_IDS, IMPLEMENTED_BLOCKS } from "@/lib/schema";
import { productTypes } from "@/product-types";
import { loadLayout } from "@/product-types/layouts";
import { siteFor } from "./helpers";

describe("block ids: one source of truth", () => {
  it("BLOCK_IDS and IMPLEMENTED_BLOCKS are derived from BLOCKS", () => {
    expect(BLOCK_IDS).toEqual(Object.keys(BLOCKS));
    expect(IMPLEMENTED_BLOCKS).toEqual(BLOCK_IDS.filter((id) => BLOCKS[id]));
    expect(BLOCK_IDS.filter((id) => !BLOCKS[id])).toEqual([]); // every block id has a component now (contact included)
  });

  it("every product type's default order is made of known block ids, and any explicit list names implemented ones only", () => {
    for (const [type, fields] of Object.entries(productTypes)) {
      const own = (fields as { defaultBlocks?: readonly string[] }).defaultBlocks;
      for (const id of defaultBlocksFor(fields)) expect(BLOCK_IDS, `${type}: ${id}`).toContain(id);
      for (const id of own ?? []) expect(IMPLEMENTED_BLOCKS as readonly string[], `${type} lists the block "${id}", which no component renders`).toContain(id);
    }
  });

  it("every implemented block id produces output (a flag without a component fails here)", () => {
    const base = siteFor("fixture-car", null);
    // a full product: the fixture has no video, so give it one
    const site = { ...base, product: { ...base.product, media: { ...base.product.media, video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } } };
    for (const id of IMPLEMENTED_BLOCKS) {
      const out = renderToStaticMarkup(<>{renderBlock(id, site)}</>);
      expect(out, id).toContain(`data-block="${id}"`);
    }
    expect(renderedBlocks({ ...site, blocks: [...BLOCK_IDS] })).toEqual(IMPLEMENTED_BLOCKS);
  });
});

describe("layout registry", () => {
  it("serves every product type with ProductLayout until a type registers its own", async () => {
    for (const type of Object.keys(productTypes)) expect(await loadLayout(type), type).toBe(ProductLayout);
  });

  it("names an unknown product type", async () => {
    await expect(loadLayout("boat")).rejects.toThrow(/Unknown productType "boat"/);
  });
});
