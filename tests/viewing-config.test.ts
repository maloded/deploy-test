// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ContentError, loadProduct } from "@/lib/content";
import { validateSeller } from "@/lib/seller";
import { validateProduct } from "@/lib/validate";
import { allowedRequestTypes } from "@/lib/request-types";
import { examples, fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "viewing-config");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const FULL = {
  address: { en: "Seller address (fake)", de: "Adresse des Verkäufers (erfunden)" },
  days: ["mon", "wed"],
  from: "09:00",
  to: "17:00",
  durationMinutes: 45,
  timezone: "Europe/Vienna",
  notes: { en: "Seller notes", de: "Hinweise des Verkäufers" },
};

let n = 0;
/** A content root: the fixture car with the given seller and product viewing settings (undefined = none). */
function root(sellerViewing: Json | undefined, productViewing: Json | undefined) {
  const dir = path.join(tmp, `r${n++}`);
  const seller = fixtures.sellerJson();
  const product = fixtures.sampleJson("fixture-car");
  if (sellerViewing) seller.viewing = sellerViewing;
  if (productViewing) product.viewing = productViewing;
  fs.mkdirSync(path.join(dir, fixtures.seller, "fixture-car"), { recursive: true });
  fs.writeFileSync(path.join(dir, fixtures.seller, "seller.json"), JSON.stringify(seller));
  fs.writeFileSync(path.join(dir, fixtures.seller, "fixture-car", "product.json"), JSON.stringify(product));
  return dir;
}
const load = (dir: string) => loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: dir, strictMedia: false });

describe("the viewing object in seller.json and product.json", () => {
  const sellerIssues = (viewing: unknown) => {
    const r = validateSeller({ ...fixtures.sellerJson(), viewing });
    return r.ok ? [] : r.issues;
  };
  const productIssues = (viewing: unknown) => {
    const r = validateProduct({ ...fixtures.sampleJson("fixture-car"), viewing });
    return r.ok ? [] : r.issues;
  };

  it("is optional, and accepts a complete object and a partial one", () => {
    expect(validateSeller(fixtures.sellerJson()).ok).toBe(true);
    expect(sellerIssues(FULL)).toEqual([]);
    expect(productIssues(FULL)).toEqual([]);
    expect(productIssues({ notes: { en: "only notes" } })).toEqual([]);
    expect(sellerIssues({})).toEqual([]);
  });

  it("checks the formats in both files, naming the field", () => {
    for (const issues of [sellerIssues, productIssues]) {
      expect(issues({ ...FULL, from: "9am" }).join("\n")).toMatch(/viewing\.from: must be a time like "10:00"/);
      expect(issues({ ...FULL, to: "09:00" }).join("\n")).toMatch(/viewing\.from: must be before to/);
      expect(issues({ ...FULL, durationMinutes: 5 }).join("\n")).toMatch(/viewing\.durationMinutes/);
      expect(issues({ ...FULL, durationMinutes: 300 }).join("\n")).toMatch(/viewing\.durationMinutes/);
      expect(issues({ ...FULL, timezone: "Mars/Base" }).join("\n")).toMatch(/viewing\.timezone: must be an IANA time zone/);
      expect(issues({ ...FULL, days: ["monday"] }).join("\n")).toMatch(/viewing\.days/);
      expect(issues({ ...FULL, days: ["mon", "mon"] }).join("\n")).toMatch(/viewing\.days: each day may appear only once/);
      expect(issues({ ...FULL, address: { fr: "Rue" } }).join("\n")).toMatch(/Supported languages: de, en/);
      expect(issues({ ...FULL, extra: 1 }).join("\n")).toMatch(/viewing/);
    }
  });
});

describe("the loader merges the settings", () => {
  it("is null when neither the seller nor the product has any: then viewing and test drive are not offered", () => {
    const loaded = load(root(undefined, undefined));
    expect(loaded.viewing).toBeNull();
    expect(allowedRequestTypes(loaded.typeFields.requestTypes, loaded.viewing !== null)).toEqual(["question", "offer"]);
  });

  it("uses the seller's settings alone, and offers every type of the product type", () => {
    const loaded = load(root(FULL, undefined));
    expect(loaded.viewing).toEqual(FULL);
    expect(allowedRequestTypes(loaded.typeFields.requestTypes, loaded.viewing !== null)).toEqual(["viewing", "test_drive", "question", "offer"]);
  });

  it("a product alone can carry complete settings", () => {
    expect(load(root(undefined, FULL)).viewing).toEqual(FULL);
  });

  it("the product overrides the seller field by field", () => {
    const loaded = load(root(FULL, { durationMinutes: 30, notes: { en: "Product notes", de: "Hinweise des Produkts" }, days: ["sat"] }));
    expect(loaded.viewing).toEqual({ ...FULL, durationMinutes: 30, notes: { en: "Product notes", de: "Hinweise des Produkts" }, days: ["sat"] });
  });

  it("completes the localized texts with the default language, like every other localized field", () => {
    const loaded = load(root({ ...FULL, address: { en: "Only English" } }, undefined));
    expect(loaded.viewing!.address).toEqual({ en: "Only English", de: "Only English" });
  });

  it("is an error when the merged settings are incomplete, naming what is missing", () => {
    const dir = root({ days: ["mon"], timezone: "Europe/Vienna" }, { from: "10:00" });
    expect(() => load(dir)).toThrow(ContentError);
    expect(() => load(dir)).toThrow(/viewing: incomplete after merging the seller's and the product's settings, missing: address, to, durationMinutes/);
  });

  it("is an error when the merge makes the hours impossible (the seller's from after the product's to)", () => {
    expect(() => load(root(FULL, { to: "08:00" }))).toThrow(/viewing\.from: must be before to/);
  });

  it("the house example has fake viewing settings; the watch, the bag and the car fixture have none", () => {
    const house = examples.loadFor("example-house", { strictMedia: false });
    expect(house.viewing).toMatchObject({ days: ["tue", "thu", "sat"], from: "10:00", to: "16:00", durationMinutes: 60, timezone: "Europe/Vienna" });
    expect(house.viewing!.address.en).toContain("example.invalid");
    expect(house.viewing!.notes!.de).toBeTruthy();
    for (const slug of ["example-watch", "example-bag"]) expect(examples.loadFor(slug, { strictMedia: false }).viewing, slug).toBeNull();
    expect(fixtures.loadFor("fixture-car", { strictMedia: false }).viewing).toBeNull();
  });
});
