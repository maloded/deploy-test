/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a loaded product */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import nextConfig from "../next.config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Specs } from "@/components/Specs";
import { Offer } from "@/components/offer/Offer";
import { renderedBlocks, type Site } from "@/components/blocks";
import { leaseFields } from "@/offer-types/lease_takeover";
import { checkThemeContrast, contrastRatio } from "@/lib/contrast";
import { shortTitle } from "@/lib/brand";
import { DEFAULT_FRAME_RANGE, frameRangeForTheme, frameRatioRange, heroFacts, heroFit, shortValue } from "@/lib/hero";
import { readImageSize } from "@/lib/image-size";
import { Header } from "@/components/Header";
import { defaultBlocksFor } from "@/lib/fields";
import { groupSpecs } from "@/lib/specs";
import { validateProduct } from "@/lib/validate";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, examples, fixtures, sampleJson, siteFor } from "./helpers";
import { listThemes } from "@/lib/themes";
import { AI_DRAFT_LANGUAGES, UI_KEYS, ui, uiEntry } from "@/lib/ui-strings";
import { loadLayout } from "@/product-types/layouts";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

async function page(site: Site) {
  const Layout = await loadLayout(site.product.productType);
  return html(<Layout site={site} />);
}

const withProduct = (site: Site, patch: (p: any) => void): Site => {
  const product = structuredClone(site.product) as any;
  patch(product);
  return { ...site, product };
};

describe("car layout", () => {
  it.each(listThemes())("renders hero, specs, offer and faq in order with the %s theme", async (theme) => {
    const site = siteFor("fixture-car", theme);
    expect(site.theme).toBe(theme);
    const out = await page(site);
    const at = (id: string) => out.indexOf(`id="${id}"`);
    expect(at("hero")).toBeGreaterThan(-1);
    expect(at("hero")).toBeLessThan(at("gallery"));
    expect(at("gallery")).toBeLessThan(at("specs"));
    expect(at("specs")).toBeLessThan(at("offer"));
    expect(at("offer")).toBeLessThan(at("faq"));
    expect(out.indexOf("<header")).toBeLessThan(at("hero"));
    expect(out.indexOf("<footer")).toBeGreaterThan(at("faq"));
  });

  it("is the same markup for both themes", async () => {
    const outs = await Promise.all(listThemes().map((t) => page(siteFor("fixture-car", t))));
    expect(new Set(outs).size).toBe(1);
  });

  it("follows the product type's default block order when product.json has none", () => {
    const site = siteFor("fixture-car", null);
    const noBlocks = { ...site, blocks: [...defaultBlocksFor(site.typeFields)] };
    // video is a default block but this product has no video, so it drops out
    expect(renderedBlocks(noBlocks)).toEqual(["hero", "gallery", "specs", "offer", "faq", "contact"]);
  });

  it("publishes the rendered block order and one anchored section per block", async () => {
    const out = await page(siteFor("fixture-car", null));
    expect(out).toContain('data-block-order="hero gallery specs offer faq contact"');
    for (const id of ["hero", "gallery", "specs", "offer", "faq"]) {
      expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"[^>]*data-block="${id}"[^>]*aria-label="[^"]+"`));
    }
    // "contact" is listed in the order, but it is the footer's contact row: an element with the id, not a section
    expect(out).toMatch(/<footer[\s\S]*<div class="site-footer__contact" id="contact" data-block="contact">/);
    expect(out).not.toMatch(/<section[^>]*id="contact"/);
  });

  it("renders no video block without media.video, and exactly one #contact target (the footer's contact row)", async () => {
    const out = await page(siteFor("fixture-car", null));
    expect(out).toContain('id="gallery"');
    expect(out).not.toContain('id="video"');
    expect(out.match(/id="contact"/g)).toHaveLength(1);
    expect(out).toMatch(/<div class="site-footer__contact" id="contact" data-block="contact"/);
    expect(out).not.toMatch(/<footer[^>]*id=/);
    expect(out).toContain('href="#contact"');
  });

  it("has one h1 and headings that never skip a level", async () => {
    const out = await page(siteFor("fixture-car", null));
    const levels = [...out.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
  });

  it("gives the gallery its own heading: a visually hidden h2 in the page language, after the h1 and before the specs' h2, inside the section", async () => {
    for (const lang of ["de", "en"] as const) {
      const out = await page(buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang));
      const gallery = /<section[^>]*id="gallery"[\s\S]*?<\/section>/.exec(out)![0];
      expect(gallery).toContain(`<h2 class="sr-only">${ui("section.gallery", lang)}</h2>`);
      expect(gallery.match(/<h[1-6][ >]/g)).toEqual(["<h2 "]); // the one heading of the block, no h1, no skipped level
      const at = (s: string) => out.indexOf(s);
      expect(at("<h1")).toBeGreaterThan(-1);
      expect(at('<h2 class="sr-only">')).toBeGreaterThan(at("<h1"));
      expect(at('<h2 class="sr-only">')).toBeLessThan(at(`<h2 class="section-title">${ui("section.specs", lang)}`));
      expect(out.match(/<h1[ >]/g)).toHaveLength(1);
    }
  });

  it("gives every image a width, a height and an alt, and preloads only the hero image", async () => {
    const out = await page(siteFor("fixture-car", null));
    const imgs = out.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toMatch(/ alt="[^"]*"/);
      expect(img).toMatch(/ width="\d+"/);
      expect(img).toMatch(/ height="\d+"/);
    }
    // Only the hero image (priority) is preloaded. Gallery slides are lazy in the markup (a preload that is used
    // late makes Chrome warn "preloaded but not used"); the gallery warms the nearest ones up after hydration.
    const preloads = out.match(/<link rel="preload" as="image"[^>]*>/g) ?? [];
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toContain("hero.jpg");
    const slides = out.match(/<img [^>]*class="gallery__img"[^>]*>/g) ?? [];
    expect(slides).toHaveLength(5);
    expect(slides.every((i) => i.includes('loading="lazy"'))).toBe(true);
  });

  it("gives the hero image its own address even when a gallery photo is the same file", async () => {
    const site = siteFor("fixture-car", null);
    const same = withProduct(site, (p) => {
      p.media.gallery[0].file = p.media.hero; // gallery photo 1 is the hero file
    });
    // render with the project's own next.config image settings (the default allows only quality 75)
    const Layout = await loadLayout("car");
    const config = { ...imageConfigDefault, ...nextConfig.images } as typeof imageConfigDefault;
    const out = html(
      <ImageConfigContext.Provider value={config}>
        <Layout site={same} />
      </ImageConfigContext.Provider>,
    );
    expect(nextConfig.images?.qualities).toEqual([75, 85]);
    const srcs = [...out.matchAll(/<img [^>]*?\ssrc="([^"]+)"/g)].map((m) => m[1]);
    const hero = /<img [^>]*class="hero__image"[^>]*?\ssrc="([^"]+)"/.exec(out)![1];
    expect(hero).toContain("q=85");
    expect(srcs.filter((s) => s === hero)).toHaveLength(1); // no slide or thumbnail shares it
  });

  it("has the other product types render too (same frame)", async () => {
    for (const slug of ["example-house", "example-watch", "example-bag"]) {
      const out = await page(examples.siteFor(slug, null));
      expect(out).toContain('data-block="hero"');
      expect(out).toContain("<footer");
    }
  });
});

describe("hero", () => {
  it("shows the monthly payment and period for a lease takeover, and the price for a sale", () => {
    expect(html(<Hero site={siteFor("fixture-car", null)} />)).toContain("€589 / month");
    expect(html(<Hero site={examples.siteFor("example-watch", null)} />)).toContain("€8,900");
  });

  it("links to #contact and #specs", () => {
    const out = html(<Hero site={siteFor("fixture-car", null)} />);
    expect(out).toContain('href="#contact"');
    expect(out).toContain('href="#specs"');
  });

  it("renders a decorative background only when media.background is set", () => {
    const site = siteFor("fixture-car", null);
    expect(html(<Hero site={site} />)).not.toContain("hero__bg");
    const file = site.product.media.hero;
    const bg = withProduct(site, (p) => (p.media.background = file));
    const out = html(<Hero site={bg} />);
    expect(out).toContain("hero__bg");
    expect(out).toMatch(/<img[^>]*hero__bg[^>]*/);
    expect(out).toContain('aria-hidden="true"');
  });

  it("shows a placeholder frame when the hero file is missing", () => {
    const site = siteFor("fixture-car", null);
    const out = html(<Hero site={{ ...site, images: {} }} />);
    expect(out).toContain("hero__placeholder");
    expect(out).toContain("Image missing: hero.jpg");
  });
});

describe("hero layout", () => {
  const site = siteFor("fixture-car", null);
  const stageOf = (out: string) => /<div class="hero__stage hero__container">([\s\S]*?)<div class="hero__intro">/.exec(out)?.[1] ?? "";
  const introOf = (out: string) => out.slice(out.indexOf('<div class="hero__intro">'));
  const out = html(<Hero site={site} />);
  const stage = stageOf(out);
  const intro = introOf(out);

  it("has a title zone and a center zone with exactly an eyebrow, a headline and the photo (no hint, figure or button)", () => {
    expect(stage.indexOf("hero__eyebrow")).toBeLessThan(stage.indexOf("<h1"));
    expect(stage.indexOf("<h1")).toBeLessThan(stage.indexOf("hero__photo"));
    expect(stage.match(/<h1/g)).toHaveLength(1);
    expect(stage).not.toContain("<a "); // no links at all: the scroll hint is gone
    for (const not of ["hero__scroll", "hero__figure", "hero__amount", "hero__note", "hero__description", "hero__facts", "hero__trust", 'class="button', "hero__tag", "€"]) {
      expect(stage, not).not.toContain(not);
    }
  });

  it("renders no scroll hint anywhere", () => {
    expect(out).not.toContain("hero__scroll");
    expect(out).not.toContain("Scroll down");
  });

  it("has a plain photo in a frame and a box: no tag, caption, figure or overlay", () => {
    const photo = /<div class="hero__photo"[^>]*>([\s\S]*?)<\/div><\/div><\/div>/.exec(stage)?.[1] ?? "";
    expect(photo).toMatch(/^<div class="hero__frame"><div class="hero__box"><img /);
    expect(photo.match(/<[a-z]+/g)).toEqual(["<div", "<div", "<img"]);
    expect(out).not.toMatch(/hero__(tag|showcase|caption)/);
  });

  it("has an intro row with a description, key facts, a figure with a note and exactly two buttons", () => {
    const main = /<div class="hero__intro-main">([\s\S]*?)<\/div><div class="hero__intro-aside">/.exec(intro)?.[1] ?? "";
    expect(main).toContain("Fixture description: take over a running lease. Example text.");
    expect(main.match(/<li class="hero__fact"/g)).toHaveLength(3);
    const aside = /<div class="hero__intro-aside">([\s\S]*?)<\/div><\/div><\/div>/.exec(intro)?.[1] ?? "";
    expect(aside).toContain('<span class="hero__amount">€589 / month</span>');
    expect(aside).toContain('<span class="hero__note">Example price. All numbers');
    const buttons = [...aside.matchAll(/<a class="(button[^"]*)" href="([^"]+)"(?: data-request-type="[a-z_]+")?>([^<]+)<\/a>/g)].map((m) => ({ cls: m[1], href: m[2], text: m[3] }));
    expect(buttons).toEqual([
      { cls: "button", href: "#contact", text: "Request details" },
      { cls: "button button--outline", href: "#specs", text: "View specifications" },
    ]);
    expect(aside.match(/<a /g)).toHaveLength(2);
    expect(out).not.toContain('class="link"');
  });

  it("shows the price only once in the hero, in the intro row", () => {
    expect(out.match(/€589/g)).toHaveLength(1);
    expect(intro).toContain("€589");
    expect(stage).not.toContain("€589");
  });

  it("shows hero.eyebrow items (for example the place) before the offer type label, joined with a dot", () => {
    expect(stage).toContain('<p class="hero__eyebrow label">Fixture listing · Lease takeover</p>');
    const plain = withProduct(site, (p) => delete p.hero);
    expect(stageOf(html(<Hero site={plain} />))).toContain('<p class="hero__eyebrow label">Lease takeover</p>');
  });

  it("uses hero.headline, else the short title, and never shows the parenthetical of the title", () => {
    expect(stage).toContain('<h1 class="hero__headline">Fixture Car</h1>');
    const plain = withProduct(site, (p) => delete p.hero);
    expect(stageOf(html(<Hero site={plain} />))).toContain('<h1 class="hero__headline">Fixture Car eHybrid</h1>');
    const sites = {
      "fixture-car": siteFor("fixture-car", null),
      "example-house": examples.siteFor("example-house", null),
      "example-watch": examples.siteFor("example-watch", null),
      "example-bag": examples.siteFor("example-bag", null),
    };
    for (const [slug, s2] of Object.entries(sites)) {
      for (const variant of [s2, withProduct(s2, (p) => delete p.hero)]) {
        const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(html(<Hero site={variant} />))![1];
        expect(h1, `${slug} headline`).not.toMatch(/[()]/);
      }
    }
    const titled = withProduct(site, (p) => {
      delete p.hero;
      p.title.en = "Rolex Submariner (ref. 126610LN)";
    });
    expect(html(<Hero site={titled} />)).toContain(">Rolex Submariner</h1>");
  });

  it("uses hero.description, else the tagline", () => {
    const plain = withProduct(site, (p) => delete p.hero);
    expect(html(<Hero site={plain} />)).toContain('<p class="hero__description">Take over a running lease on a seven-seat family van. Example text.</p>');
  });

  it("builds the key facts from hero.highlights, or from the type's hero specs that exist", () => {
    expect(intro).toContain('<span class="hero__fact-value">150 kW</span><span class="hero__fact-label">Power</span>');
    expect(intro).toContain('<span class="hero__fact-value">Plug-in hybrid</span>');

    const byType = withProduct(site, (p) => delete p.hero.highlights);
    const facts = [...html(<Hero site={byType} />).matchAll(/hero__fact-value">([^<]*)<\/span><span class="hero__fact-label">([^<]*)</g)].map((m) => [m[1], m[2]]);
    // car default keys year, power, fuel, mileage: mileage does not exist as a spec; "(204 PS)" is cut; units stay
    expect(facts).toEqual([["2023", "Year"], ["150 kW", "Power"], ["Plug-in hybrid", "Fuel"]]);

    const de = { ...withProduct(site, (p) => delete p.hero.highlights), lang: "de" as const };
    expect(html(<Hero site={de} />)).toContain('hero__fact-label">Leistung<');

    const none = withProduct(site, (p) => {
      delete p.hero.highlights;
      p.specs = [];
    });
    expect(html(<Hero site={none} />)).not.toContain("hero__facts");
  });

  it("shows at most four key facts", () => {
    const many = withProduct(site, (p) => {
      p.hero.highlights = ["year", "power", "fuel", "gearbox"];
    });
    expect(html(<Hero site={many} />).match(/<li class="hero__fact"/g)).toHaveLength(4);
  });

  it("renders the trust items as one thin line under the intro row, or nothing", () => {
    expect(intro).toContain('<ul class="hero__trust"><li>Fixture: documented service history</li><li>Fixture: documented ownership</li><li>Fixture: transfer support</li></ul>');
    expect(intro.indexOf("hero__intro-grid")).toBeLessThan(intro.indexOf("hero__trust"));
    expect(stage).not.toContain("hero__trust");
    const none = withProduct(site, (p) => delete p.hero.trust);
    expect(html(<Hero site={none} />)).not.toContain("hero__trust");
    const de = { ...site, lang: "de" as const };
    expect(html(<Hero site={de} />)).toContain("<li>Fixture: Servicehistorie</li>");
  });

  it("keeps the mobile order: eyebrow, headline, photo, description, facts, figure, note, button a, button b, trust", () => {
    const order = ["hero__eyebrow", "hero__headline", "hero__photo", "hero__description", "hero__facts", "hero__figure", "hero__note", 'class="button"', "button button--outline", "hero__trust"];
    const at = order.map((k) => out.indexOf(k));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("validates the hero options", () => {
    const check = (hero: unknown) => {
      const p = sampleJson("fixture-car");
      p.hero = hero;
      const r = validateProduct(p);
      return r.ok ? [] : r.issues.join("\n");
    };
    expect(check(sampleJson("fixture-car").hero)).toEqual([]);
    expect(check({})).toEqual([]);
    expect(check({ trust: { en: "a single text is the old form" } })).toMatch(/hero\.trust/);
    expect(check({ trust: [{}] })).toMatch(/hero\.trust\.0: needs a text/);
    expect(check({ highlights: ["year", "power", "fuel", "gearbox", "seats"] })).toMatch(/hero\.highlights/); // at most 4
    expect(check({ highlights: [{ value: "150 kW", label: { en: "Power" } }] })).toMatch(/hero\.highlights\.0/); // the old { value, label } form is gone
    expect(check({ highlights: ["power", "nonsense"] })).toMatch(/hero\.highlights\.1: no spec with key "nonsense"\. Spec keys: year, power/);
    expect(check({ eyebrow: [] })).toMatch(/hero\.eyebrow/);
    expect(check({ slogan: "x" })).toMatch(/hero/);
  });
});

describe("hero photo fit", () => {
  const site = siteFor("fixture-car", null);
  const withHero = (file: string): Site => {
    const size = readImageSize(path.join(fixtures.productDir("fixture-car"), "media", file));
    const next = withProduct(site, (p) => (p.media.hero = file));
    return { ...next, images: { ...next.images, [file]: { src: `/media/${fixtures.ref("fixture-car")}/${file}`, ...size } } };
  };
  const photoOf = (out: string) => /<div class="hero__photo" data-fit="(\w+)">/.exec(out)?.[1];

  it.each([
    ["hero.jpg", "3:2 landscape", "cover"],
    ["landscape-43.jpg", "4:3 landscape", "cover"],
    ["sideways.jpg", "portrait stored sideways (shown 3:4)", "contain"],
    ["portrait.jpg", "portrait 2:3", "contain"],
    ["panorama.jpg", "3:1 panorama", "contain"],
  ])("%s (%s) uses %s", (file, _label, fit) => {
    const out = html(<Hero site={withHero(file)} />);
    expect(photoOf(out)).toBe(fit);
    const img = /<img [^>]*class="hero__image"[^>]*>/.exec(out)![0];
    if (fit === "cover") expect(img).toContain("object-position:50% 50%"); // the focus point
    else expect(img).not.toContain("object-position"); // contain is centered, never cropped
  });

  it("with the themes' range (1 .. 4/3) a 4:3 photo is cover and exactly fits the widest frame", () => {
    const range = frameRangeForTheme("light-editorial");
    expect(heroFit(1200, 900, range)).toBe("cover"); // 4:3: no crop at the widest frame (ratio equals the photo's)
    expect(heroFit(1200, 800, range)).toBe("cover"); // 3:2 (1.5) is inside [0.85, 1.533]
    expect(heroFit(1600, 900, range)).toBe("contain"); // 16:9 is shown whole on a matte
  });

  it("uses the display size after EXIF rotation, not the stored size", () => {
    const stored = readImageSize(path.join(fixtures.productDir("fixture-car"), "media", "sideways.jpg"));
    expect(stored).toEqual({ width: 1200, height: 1600 }); // stored 1600x1200 with orientation 6
  });

  it("keeps the title zone and the bottom row identical whatever the photo is", () => {
    const outs = ["hero.jpg", "landscape-43.jpg", "sideways.jpg", "portrait.jpg", "panorama.jpg"].map((f) => html(<Hero site={withHero(f)} />));
    // the preload link belongs to the photo too (it names the hero image)
    const withoutPhoto = outs.map((o) => o.replace(/<link rel="preload"[^>]*>/g, "").replace(/<div class="hero__photo"[\s\S]*?<\/div><\/div><\/div>/, "<PHOTO/>"));
    expect(new Set(withoutPhoto).size).toBe(1);
    expect(withoutPhoto[0]).toContain("<PHOTO/>");
    expect(new Set(outs).size).toBe(5); // and only the photo zone differs
  });

  it("shows a placeholder frame, in the same frame, when the file is missing", () => {
    const out = html(<Hero site={{ ...site, images: {} }} />);
    expect(out).toContain('<div class="hero__photo" data-fit="cover">');
    expect(out).toContain("hero__placeholder");
  });
});

describe("hero fit helpers", () => {
  it("decides cover or contain against the extreme frame ratios, with a 15% tolerance", () => {
    const range = { min: 1, max: 16 / 9 }; // contain below 0.85 and above 2.0444
    expect(heroFit(1200, 900, range)).toBe("cover"); // 4:3
    expect(heroFit(1200, 800, range)).toBe("cover"); // 3:2
    expect(heroFit(1000, 1000, range)).toBe("cover"); // square
    expect(heroFit(1700, 1000, range)).toBe("cover");
    expect(heroFit(850, 1000, range)).toBe("cover"); // exactly 0.85: still cover
    expect(heroFit(849, 1000, range)).toBe("contain");
    expect(heroFit(1200, 1600, range)).toBe("contain"); // 3:4
    expect(heroFit(2400, 800, range)).toBe("contain"); // 3:1
    expect(heroFit(2040, 1000, range)).toBe("cover");
    expect(heroFit(2050, 1000, range)).toBe("contain");
  });

  it("uses the theme's ratio variables when they are set, else 1 and 16/9", () => {
    expect(frameRatioRange(undefined, "x")).toEqual({ min: 1, max: 16 / 9 });
    const css = ':root[data-theme="x"] { --hero-frame-min-ratio: 0.8; --hero-frame-max-ratio: 2; }';
    expect(frameRatioRange(css, "x")).toEqual({ min: 0.8, max: 2 });
    expect(frameRatioRange(':root[data-theme="x"] { --hero-frame-max-ratio: 16 / 10; }', "x").max).toBeCloseTo(1.6, 5);
    expect(frameRatioRange(':root[data-theme="x"] { --hero-frame-min-ratio: 3; --hero-frame-max-ratio: 2; }', "x")).toEqual(DEFAULT_FRAME_RANGE);
    expect(heroFit(1000, 1250, frameRatioRange(css, "x"))).toBe("cover"); // 0.8 is inside [0.68, 2.3]
    // both themes set the widest frame ratio to 4 / 3 (the narrowest stays 1)
    for (const theme of ["light-editorial", "dark-premium"]) {
      const range = frameRangeForTheme(theme);
      expect(range.min).toBe(1);
      expect(range.max).toBeCloseTo(4 / 3, 5);
    }
    expect(frameRangeForTheme("no-such-theme")).toEqual(DEFAULT_FRAME_RANGE);
  });
});

describe("hero helpers", () => {
  it("shortens a spec value for display and keeps its unit", () => {
    expect(shortValue("150 kW (204 PS)")).toBe("150 kW");
    expect(shortValue("Automatic, 8 speeds")).toBe("Automatic");
    expect(shortValue("21,400 km")).toBe("21,400 km");
    expect(shortValue("(odd)")).toBe("(odd)");
  });

  it("builds default facts from each type's spec keys, only for specs that exist", () => {
    const house = examples.siteFor("example-house", null);
    const facts = heroFacts(house.product, house.typeFields, "en");
    expect(facts.map((f) => f.label)).toEqual(["Bedrooms", "Location"]); // heating is not a hero key; area and plot do not exist
    const bag = examples.siteFor("example-bag", null);
    expect(heroFacts(bag.product, bag.typeFields, "en").map((f) => f.label)).toEqual(["Material", "Dimensions", "Condition"]);
  });
});

describe("offer disclaimer", () => {
  it("sits directly under the columns, not inside them", () => {
    const out = html(<Offer site={siteFor("fixture-car", null)} variant="lease" />);
    expect(out).toContain('</div><p class="offer__disclaimer">');
    expect(out.indexOf("offer__columns")).toBeLessThan(out.indexOf("offer__disclaimer"));
  });
});

describe("lease takeover offer", () => {
  const site = siteFor("fixture-car", null);
  const out = html(<Offer site={site} variant="lease" />);

  it("shows every lease field and the disclaimer", () => {
    for (const f of leaseFields) {
      if ((site.product.lease as any)[f.key] === undefined) continue;
      expect(out).toContain(`data-field="${f.key}"`);
      expect(out).toContain(f.label.en);
    }
    expect(out).toContain("18 months");
    expect(out).toContain("Example Leasing GmbH");
    expect(out).toContain("Example: the leasing company must approve the transfer. Fake terms.");
    expect(out).toContain(ui("offer.disclaimer.lease", "en"));
    expect(out).toContain('href="#contact"');
  });

  it("shows €589 / month as the large figure", () => {
    expect(out).toMatch(/class="offer__price">€589 \/ month</);
  });

  it("shows lease fields only when they are present in the data", () => {
    const partial = withProduct(site, (p) => {
      delete p.lease.takeoverFee;
      delete p.lease.notes;
    });
    const res = html(<Offer site={partial} variant="lease" />);
    expect(res).not.toContain('data-field="takeoverFee"');
    expect(res).not.toContain('data-field="notes"');
    expect(res).toContain('data-field="residualValue"');
  });

  it("uses the neutral disclaimer for the price variant", () => {
    const res = html(<Offer site={examples.siteFor("example-watch", null)} variant="price" />);
    expect(res).toContain(ui("offer.disclaimer.default", "en"));
    expect(res).not.toContain(ui("offer.disclaimer.lease", "en"));
  });
});

describe("specs", () => {
  const site = siteFor("fixture-car", null);

  it("groups by the product type's groups, in the type's order", () => {
    const groups = groupSpecs(site.product.specs, site.typeFields, "en");
    expect(groups.map((g) => g.id)).toEqual(["engine", "body", "interior"]);
    expect(groups[0].rows.map((r) => r.key)).toEqual(["power", "fuel", "gearbox"]);
    expect(groups[0].label).toBe("Engine");
  });

  it("renders a label and a <dl> per group", () => {
    const out = html(<Specs site={site} />);
    expect(out.match(/<dl /g)).toHaveLength(3);
    expect(out.indexOf("Engine")).toBeLessThan(out.indexOf("Body"));
    expect(out.indexOf("Body")).toBeLessThan(out.indexOf("Interior"));
    expect(out).not.toContain("Equipment");
  });

  it("puts specs with an unknown or missing group into a trailing Other group", () => {
    const odd = withProduct(site, (p) => {
      p.specs.push({ key: "x", label: { en: "Mystery" }, value: "1", group: "nonsense" });
      p.specs.push({ key: "y", label: { en: "Loose" }, value: "2" });
    });
    const groups = groupSpecs(odd.product.specs, odd.typeFields, "en");
    expect(groups.at(-1)).toMatchObject({ id: "other", label: null });
    expect(groups.at(-1)?.rows.map((r) => r.key)).toEqual(["x", "y"]);
    const out = html(<Specs site={odd} />);
    expect(out).toContain("Other");
    expect(out).toContain("Mystery");
  });

  it("renders nothing when there are no specs", () => {
    expect(html(<Specs site={withProduct(site, (p) => (p.specs = []))} />)).toBe("");
  });
});

describe("faq", () => {
  const site = siteFor("fixture-car", null);

  it("uses native details/summary, without scripts or button handlers", () => {
    const out = html(<Faq site={site} />);
    expect(out.match(/<details /g)).toHaveLength(site.product.faq.length);
    expect(out.match(/<summary /g)).toHaveLength(site.product.faq.length);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onClick");
    expect(out).toContain("faq__icon");
  });

  it("renders nothing without questions", () => {
    expect(html(<Faq site={withProduct(site, (p) => (p.faq = []))} />)).toBe("");
  });
});

describe("footer", () => {
  it("has the product name, a mailto link and a legal line, and no privacy link until the seller has one", () => {
    const out = html(<Footer site={siteFor("fixture-car", null)} />);
    expect(out).toContain('href="mailto:example@example.com"');
    expect(out).not.toContain("#privacy");
    expect(out).toContain("does not constitute a binding offer");
  });
});

describe("prototype note", () => {
  const site = siteFor("fixture-car", null);
  afterEach(() => vi.unstubAllEnvs());

  it("is shown in the footer only when NEXT_PUBLIC_PROTOTYPE_NOTE is set", () => {
    expect(html(<Footer site={site} />)).not.toContain("Prototype");
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "1");
    expect(html(<Footer site={site} />)).toContain('<p class="site-footer__prototype">Prototype. Content is a draft and not yet confirmed by the seller.</p>');
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", "");
    expect(html(<Footer site={site} />)).not.toContain("Prototype");
  });

  it("is a UI string with a draft for de", () => {
    expect(ui("footer.prototype", "de")).toBe("Prototyp. Die Inhalte sind ein Entwurf und noch nicht vom Verkäufer bestätigt.");
  });
});

describe("ui strings", () => {
  it("has every key in en and de", () => {
    for (const key of UI_KEYS) {
      const entry = uiEntry(key);
      for (const lang of ["en", ...AI_DRAFT_LANGUAGES] as const) expect(entry[lang], `${key}.${lang}`).toBeTruthy();
    }
  });

  it("falls back to English for a missing translation", () => {
    expect(ui("header.cta", "de")).toBe("Kontakt aufnehmen");
  });

  it("marks de as a draft in the source", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "ui-strings.ts"), "utf8");
    expect(src).toMatch(/AI-WRITTEN DRAFTS/);
  });
});

describe("contrast", () => {
  it("computes known WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it.each(listThemes())("%s passes every text and accent pair at 4.5:1", (theme) => {
    const css = fs.readFileSync(path.join(process.cwd(), "public", "themes", `${theme}.css`), "utf8");
    for (const r of checkThemeContrast(css, theme)) expect(r.ratio, `${theme}: ${r.name}`).toBeGreaterThanOrEqual(r.min);
  });
});

describe("no raw sizes in components", () => {
  it("uses px only for 1-3px hairlines and outlines", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(css|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "src"));
    for (const f of files) {
      // comments and the `sizes` hint of next/image (an image-loading hint, not styling) are not styles
      const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/sizes="[^"]*"/g, "");
      for (const m of src.matchAll(/(?<![\w.#-])(\d+(?:\.\d+)?)px\b/g)) {
        expect(["1", "2", "3"], `${path.relative(process.cwd(), f)}: ${m[0]}`).toContain(m[1]);
      }
    }
  });
});

describe("brand", () => {
  const site = siteFor("fixture-car", null);

  it("shows in the header and the footer; the h1 is the hero headline, not the brand", () => {
    expect(html(<Header site={site} />)).toContain(">Fixture Seller<");
    const footer = html(<Footer site={site} />);
    expect(footer).toContain("Fixture Seller");
    expect(footer).toContain("does not constitute a binding offer");
    expect(html(<Hero site={site} />)).toContain(">Fixture Car</h1>");
  });

  it("is the seller's displayName; a product cannot carry its own brand any more", () => {
    expect(site.seller.displayName).toBe("Fixture Seller");
    const p = sampleJson("fixture-car");
    p.brand = "Other";
    const r = validateProduct(p);
    expect(!r.ok && r.issues.join("\n")).toMatch(/^brand: moved to the seller's seller\.json/m);
  });

  it("cuts a title at the first bracket, bar, dash or comma", () => {
    expect(shortTitle("Rolex Submariner (ref. 126610LN)")).toBe("Rolex Submariner");
    expect(shortTitle("Villa Aurora | Lake Como")).toBe("Villa Aurora");
    expect(shortTitle("Birkin 30, Togo leather")).toBe("Birkin 30");
    expect(shortTitle("Plain title")).toBe("Plain title");
    expect(shortTitle("Model 1,500 Edition")).toBe("Model 1,500 Edition"); // a thousands comma is not a cut
    expect(shortTitle("(only brackets)")).toBe("(only brackets)");
  });

  it("lets the header name wrap instead of cutting it with an ellipsis", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
    const rule = /\.site-header__name \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).not.toMatch(/text-overflow|nowrap/);
    expect(rule).toMatch(/overflow-wrap/);
  });
});
