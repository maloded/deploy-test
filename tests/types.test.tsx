/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/Hero";
import { Offer } from "@/components/offer/Offer";
import { ContentError, loadProduct } from "@/lib/content";
import { examples, fixtures, sampleJson, siteFor } from "./helpers";
import { buildObjectSchema, defaultBlocksFor, type OfferTypeDef } from "@/lib/fields";
import { checkCssFallbacks, varsWithoutFallback } from "@/lib/theme-check";
import { listThemes } from "@/lib/themes";
import { defaultRegistries, validateProduct } from "@/lib/validate";
import { OFFER_VARIANTS, getOfferType, offerTypes } from "@/offer-types";
import { getProductType, productTypes } from "@/product-types";
import { loadLayout } from "@/product-types/layouts";

/** One sample per product type, each with the helpers bound to the root it lives in. */
const SAMPLES = {
  car: { slug: "fixture-car", ...fixtures },
  house: { slug: "example-house", ...examples },
  watch: { slug: "example-watch", ...examples },
  bag: { slug: "example-bag", ...examples },
} as const;

const sample = (slug: string): Record<string, any> => sampleJson(slug);

const issues = (data: unknown, reg = defaultRegistries) => {
  const r = validateProduct(data, reg);
  return r.ok ? [] : r.issues;
};

const rentDetails = {
  depositMonths: 2,
  minTermMonths: 12,
  utilitiesIncluded: false,
  availableFrom: "2027-01-01",
  notes: { en: "Example note." },
};

describe("product types", () => {
  it.each(Object.entries(SAMPLES))("loads and validates the %s sample", (type, sample) => {
    const { product, typeFields, blocks } = sample.loadFor(sample.slug);
    expect(product.productType).toBe(type);
    expect(typeFields).toBe(productTypes[type as keyof typeof productTypes]);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("uses the type's default blocks when product.json has none", () => {
    const { blocks, typeFields } = examples.loadFor("example-watch");
    expect(blocks).toEqual(defaultBlocksFor(typeFields));
  });

  it('validates an "other" product against _base', () => {
    const p = examples.sampleJson("example-bag");
    p.productType = "other";
    delete p.details;
    p.specs = [];
    expect(issues(p)).toEqual([]);
    expect(getProductType("other").id).toBe("_base");
  });

  it("reports an unknown productType with the known ones", () => {
    const p = examples.sampleJson("example-bag");
    p.productType = "spaceship";
    expect(issues(p).join("\n")).toMatch(/productType: unknown "spaceship"\. Known product types: car, house, watch, bag, other/);
    expect(() => getProductType("spaceship")).toThrow(/Unknown productType "spaceship"/);
  });

  it("fails loading with a readable error list for an unknown productType", () => {
    const dir = path.join(process.cwd(), ".test-tmp", "unknown-type");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, examples.seller), { recursive: true });
    fs.copyFileSync(path.join(examples.root, examples.seller, "seller.json"), path.join(dir, examples.seller, "seller.json"));
    fs.cpSync(examples.productDir("example-bag"), path.join(dir, examples.seller, "example-bag"), { recursive: true });
    const file = path.join(dir, examples.seller, "example-bag", "product.json");
    fs.writeFileSync(file, JSON.stringify({ ...examples.sampleJson("example-bag"), productType: "spaceship" }));
    try {
      loadProduct(examples.ref("example-bag"), { contentDir: dir });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      expect((e as ContentError).message).toMatch(/Known product types/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires the type's details object", () => {
    const p = examples.sampleJson("example-house");
    delete p.details;
    expect(issues(p)).toContain('details.property: is required for product type "house"');
  });

  it("validates the type's details fields", () => {
    const p = examples.sampleJson("example-house");
    p.details.property.energyClass = "Z";
    p.details.property.areaM2 = "big";
    const out = issues(p).join("\n");
    expect(out).toMatch(/details\.property\.energyClass/);
    expect(out).toMatch(/details\.property\.areaM2/);
  });

  it("rejects details keys the type does not use", () => {
    const p = examples.sampleJson("example-watch");
    p.details.property = {};
    expect(issues(p).join("\n")).toMatch(/details\.property: not used by product type "watch" \(expected details\.provenance\)/);
  });

  it("checks spec groups and required specs", () => {
    const p = sample("fixture-car");
    p.specs[0].group = "nonsense";
    p.specs = p.specs.filter((s: any) => s.key !== "power");
    const out = issues(p).join("\n");
    expect(out).toMatch(/specs\.0\.group: unknown group "nonsense" for product type "car"\. Groups: engine, body, interior, equipment/);
    expect(out).toMatch(/specs: missing required spec "power"/);
  });

  it("registry data is plain serializable data", () => {
    for (const t of Object.values(productTypes)) expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    for (const o of Object.values(offerTypes)) expect(JSON.parse(JSON.stringify(o))).toEqual(o);
  });

  it("every type allows only offer types that exist, with groups and ratios set", () => {
    for (const t of Object.values(productTypes)) {
      for (const id of t.allowedOfferTypes) expect(offerTypes).toHaveProperty(id);
      expect(t.specGroups.length).toBeGreaterThan(0);
      expect(t.media.heroRatio).toMatch(/^\d+ \/ \d+$/);
      for (const f of t.specFields) expect(t.specGroups.map((g) => g.id)).toContain(f.group);
    }
  });

  it("has the documented defaults", () => {
    expect(productTypes.car.media.heroRatio).toBe("3 / 2");
    expect(productTypes.house.media.heroRatio).toBe("16 / 9");
    expect(productTypes.watch.media.heroRatio).toBe("1 / 1");
    expect(productTypes.bag.media.heroRatio).toBe("4 / 5");
    expect(productTypes.car.allowedOfferTypes).toEqual(["sale", "lease_takeover"]);
    expect(productTypes.house.allowedOfferTypes).toEqual(["sale", "rent"]);
    expect(productTypes.watch.allowedOfferTypes).toEqual(["sale"]);
    expect(productTypes.bag.allowedOfferTypes).toEqual(["sale"]);
  });
});

describe("offer types", () => {
  it("rejects a missing rent object", () => {
    const p = examples.sampleJson("example-house");
    p.offerType = "rent";
    p.price.per = "month";
    expect(issues(p)).toContain('rent: is required when offerType is "rent"');
  });

  it("accepts a house for rent", () => {
    const p = examples.sampleJson("example-house");
    p.offerType = "rent";
    p.price.per = "month";
    p.rent = rentDetails;
    expect(issues(p)).toEqual([]);
  });

  it("rejects rent without price.per", () => {
    const p = examples.sampleJson("example-house");
    p.offerType = "rent";
    p.rent = rentDetails;
    expect(issues(p)).toContain('price.per: is required when offerType is "rent"');
  });

  it("rejects wrong rent fields", () => {
    const p = examples.sampleJson("example-house");
    p.offerType = "rent";
    p.price.per = "month";
    p.rent = { ...rentDetails, minTermMonths: 0, availableFrom: "soon" };
    const out = issues(p).join("\n");
    expect(out).toMatch(/rent\.minTermMonths/);
    expect(out).toMatch(/rent\.availableFrom/);
  });

  it.each([
    ["watch", "example-watch", "rent"],
    ["watch", "example-watch", "lease_takeover"],
    ["bag", "example-bag", "rent"],
    ["bag", "example-bag", "lease_takeover"],
  ])("rejects a %s with offerType %s and names the allowed offer types", (type, slug, offerType) => {
    const p = examples.sampleJson(slug);
    p.offerType = offerType;
    const out = issues(p).join("\n");
    expect(out).toContain(`offerType: "${offerType}" is not allowed for product type "${type}". Allowed offer types: sale`);
  });

  it("names both allowed offer types for a car and a house", () => {
    const car = sample("fixture-car");
    car.offerType = "rent";
    expect(issues(car).join("\n")).toContain('Allowed offer types: sale, lease_takeover');
    const house = examples.sampleJson("example-house");
    house.offerType = "lease_takeover";
    expect(issues(house).join("\n")).toContain('Allowed offer types: sale, rent');
  });

  it("rejects an unknown offerType with the known ones", () => {
    const p = examples.sampleJson("example-house");
    p.offerType = "barter";
    expect(issues(p).join("\n")).toMatch(/offerType: unknown "barter"\. Known offer types: sale, lease_takeover, rent/);
    expect(() => getOfferType("barter")).toThrow(/Unknown offerType "barter"/);
  });

  it("every offer type uses a variant that exists", () => {
    for (const o of Object.values(offerTypes)) expect(OFFER_VARIANTS).toContain(o.variant);
  });

  it("a fourth offer type needs only its own data and an allowedOfferTypes entry", () => {
    // Fixture: a new offer type "auction" (data only, reusing the "price" variant) allowed for watches.
    const auction = {
      id: "auction",
      label: { en: "Auction" },
      variant: "price",
      detailsKey: "auction",
      detailsFields: [
        { key: "reservePrice", type: "number", min: 0, unit: "money", required: true, label: { en: "Reserve price" } },
        { key: "endsOn", type: "date", required: true, label: { en: "Ends on" } },
      ],
      price: { per: "forbidden" },
    } as const satisfies OfferTypeDef;
    const reg = {
      productTypes: {
        ...defaultRegistries.productTypes,
        watch: { ...productTypes.watch, allowedOfferTypes: [...productTypes.watch.allowedOfferTypes, "auction"] },
      },
      offerTypes: { ...defaultRegistries.offerTypes, auction },
    };

    const p = examples.sampleJson("example-watch");
    p.offerType = "auction";
    p.auction = { reservePrice: 5000, endsOn: "2027-02-01" };
    expect(issues(p, reg)).toEqual([]);
    expect(OFFER_VARIANTS).toContain(auction.variant);

    // still enforced for the new type
    expect(issues({ ...p, auction: { reservePrice: -1, endsOn: "x" } }, reg).join("\n")).toMatch(/auction\.reservePrice[\s\S]*auction\.endsOn/);
    expect(issues({ ...p, auction: undefined }, reg)).toContain('auction: is required when offerType is "auction"');
    // not allowed for a bag, and unknown with the default registry
    const bag = { ...examples.sampleJson("example-bag"), offerType: "auction", auction: p.auction };
    expect(issues(bag, reg).join("\n")).toContain('"auction" is not allowed for product type "bag". Allowed offer types: sale');
    expect(issues(p).join("\n")).toMatch(/offerType: unknown "auction"/);
  });

  it("builds a schema from plain descriptors", () => {
    const schema = buildObjectSchema(offerTypes.rent.detailsFields);
    expect(schema.safeParse(rentDetails).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("rendering", () => {
  const html = (node: React.ReactElement) => renderToStaticMarkup(node);

  it("renders the lease and rent offer variants from product.json", () => {
    const lease = siteFor("fixture-car", null);
    const leaseHtml = html(<Offer site={lease} variant="lease" />);
    expect(leaseHtml).toContain("Lease takeover");
    expect(leaseHtml).toContain("Example Leasing GmbH");
    expect(leaseHtml).toContain("18 months");

    const rentSite = { ...examples.siteFor("example-house", null) };
    rentSite.product = { ...rentSite.product, offerType: "rent", price: { ...rentSite.product.price, per: "month" }, rent: rentDetails };
    const rentHtml = html(<Offer site={rentSite} variant="rent" />);
    expect(rentHtml).toContain("Rent");
    expect(rentHtml).toContain("€890,000 / month");
    expect(rentHtml).toContain("Minimum term");
    expect(rentHtml).toContain("12 months");
    expect(rentHtml).toContain("Example note.");
  });

  it("applies the hero focus point as object-position", () => {
    const site = siteFor("fixture-car", null);
    expect(html(<Hero site={site} />)).toContain("object-position:50% 50%");
    const noFocus = { ...site, product: { ...site.product, media: { ...site.product.media, heroFocus: undefined } } };
    expect(html(<Hero site={noFocus} />)).not.toContain("object-position");
  });

  it("renders the price variant without a details list", () => {
    const site = examples.siteFor("example-watch", null);
    const out = html(<Offer site={site} variant="price" />);
    expect(out).toContain("Sale");
    expect(out).not.toContain("<dl");
  });

  it.each(Object.entries(SAMPLES))("renders the %s sample with both themes: same markup, theme only in CSS", async (_type, sample) => {
    const themes = listThemes();
    expect(themes.length).toBeGreaterThanOrEqual(2);
    const outputs: string[] = [];
    for (const theme of themes) {
      const site = sample.siteFor(sample.slug, theme);
      expect(site.theme).toBe(theme);
      const Layout = await loadLayout(site.product.productType);
      const out = html(<Layout site={site} />);
      expect(out).toContain(`pt pt-${site.product.productType}`);
      expect(out).toContain("hero__headline");
      outputs.push(out);
    }
    expect(new Set(outputs).size).toBe(1);
  });

  it("the layout sets the type's media ratio and uses no raw colors", async () => {
    for (const [type, sample] of Object.entries(SAMPLES)) {
      const site = sample.siteFor(sample.slug, null);
      const Layout = await loadLayout(type);
      const out = html(<Layout site={site} />);
      expect(out).toContain(`--media-ratio:${productTypes[type as keyof typeof productTypes].media.heroRatio}`);
      expect(out).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    }
  });
});

describe("type css", () => {
  it("declares every non-theme variable with a fallback", () => {
    for (const { file, vars } of checkCssFallbacks()) expect(vars, file).toEqual([]);
  });

  it("detects a variable without fallback", () => {
    expect(varsWithoutFallback(".a { aspect-ratio: var(--media-ratio); color: var(--text); }")).toEqual(["--media-ratio"]);
    expect(varsWithoutFallback(".a { aspect-ratio: var(--media-ratio, 3 / 2); color: var(--text); }")).toEqual([]);
  });

  it("every product type folder holds its descriptor only (the one ProductLayout serves all types)", () => {
    for (const dir of ["_base", "car", "house", "watch", "bag"]) {
      expect(fs.readdirSync(path.join(process.cwd(), "src", "product-types", dir)), dir).toEqual(["fields.ts"]);
    }
  });
});
