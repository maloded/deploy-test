/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import { describe, expect, it } from "vitest";
import { productSchema } from "@/lib/schema";
import { validateProduct } from "@/lib/validate";
import { content, hasRealContent, sampleJson } from "./helpers";

const sample = (slug = "fixture-car"): Record<string, any> => sampleJson(slug);

function issuesFor(data: unknown): string[] {
  const r = validateProduct(data);
  return r.ok ? [] : r.issues;
}

describe("product schema", () => {
  it("accepts the fixture product (JSON only, no photos needed)", () => {
    expect(issuesFor(sample())).toEqual([]);
  });

  it.skipIf(!hasRealContent)("accepts the real product (JSON only, no photos needed)", () => {
    expect(issuesFor(content.sampleJson("vw-multivan"))).toEqual([]);
  });

  it("accepts a product without blocks (the type's default order is used)", () => {
    const p = sample();
    delete p.blocks;
    expect(issuesFor(p)).toEqual([]);
  });

  it("rejects a missing title", () => {
    const p = sample();
    delete p.title;
    expect(issuesFor(p).join("\n")).toMatch(/^title:/m);
  });

  it("rejects a title without English", () => {
    const p = sample();
    p.title = { de: "Nur Deutsch" };
    expect(issuesFor(p).join("\n")).toMatch(/title\.en/);
  });

  it("rejects an unknown block id", () => {
    const p = sample();
    p.blocks = ["hero", "carousel"];
    expect(issuesFor(p).join("\n")).toMatch(/blocks\.1/);
  });

  it("rejects a duplicate block id", () => {
    const p = sample();
    p.blocks = ["hero", "hero"];
    expect(issuesFor(p).join("\n")).toMatch(/blocks: each block id may appear only once/);
  });

  it("rejects a theme that is not a string", () => {
    const p = sample();
    p.theme = 42;
    expect(issuesFor(p).join("\n")).toMatch(/^theme:/m);
  });

  it("rejects an unsupported schemaVersion", () => {
    const p = sample();
    p.schemaVersion = 2;
    expect(issuesFor(p).join("\n")).toMatch(/schemaVersion/);
  });

  it("rejects a spec value that is neither string nor localized", () => {
    const p = sample();
    p.specs[0].value = 2023;
    expect(issuesFor(p).join("\n")).toMatch(/specs\.0\.value/);
  });

  it("rejects a top-level field nobody knows (typo protection)", () => {
    const p = sample();
    p.titel = { en: "typo" };
    expect(issuesFor(p)).toContain("titel: unknown field");
  });

  it("the base schema alone does not know product or offer types", () => {
    const p = sample();
    p.productType = "spaceship";
    expect(productSchema.safeParse(p).success).toBe(true);
  });
});

describe("lease object (offerType lease_takeover)", () => {
  it("is required", () => {
    const p = sample();
    delete p.lease;
    expect(issuesFor(p).join("\n")).toMatch(/lease: is required when offerType is "lease_takeover"/);
  });

  it("requires price.per", () => {
    const p = sample();
    delete p.price.per;
    expect(issuesFor(p).join("\n")).toMatch(/price\.per: is required/);
  });

  it("is rejected on a sale", () => {
    const p = sample();
    p.offerType = "sale";
    delete p.price.per;
    expect(issuesFor(p).join("\n")).toMatch(/lease: is only allowed when offerType is "lease_takeover"/);
  });

  it("is not needed on a sale, and a sale must not have price.per", () => {
    const p = sample();
    p.offerType = "sale";
    delete p.lease;
    expect(issuesFor(p).join("\n")).toMatch(/price\.per: must not be set when offerType is "sale"/);
    delete p.price.per;
    expect(issuesFor(p)).toEqual([]);
  });

  it("reports a wrong field type with its path", () => {
    const p = sample();
    p.lease.termMonthsLeft = "18";
    p.lease.endDate = "30.04.2028";
    p.lease.transferApprovalRequired = "yes";
    const out = issuesFor(p).join("\n");
    expect(out).toMatch(/lease\.termMonthsLeft/);
    expect(out).toMatch(/lease\.endDate/);
    expect(out).toMatch(/lease\.transferApprovalRequired/);
  });

  it("rejects unknown fields inside the lease object", () => {
    const p = sample();
    p.lease.surprise = 1;
    expect(issuesFor(p).join("\n")).toMatch(/lease:.*surprise/);
  });
});
