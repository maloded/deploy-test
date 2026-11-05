// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/Footer";
import ProductLayout from "@/components/ProductLayout";
import { REQUEST_TYPES } from "@/lib/request-types";
import { buildSite } from "@/lib/site";
import { sellerSchema } from "@/lib/seller";
import { UI_KEYS, ui } from "@/lib/ui-strings";
import { examples, FIXTURE_DIR, fixtures } from "./helpers";
import { selectedType } from "./form-ui";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const base = (lang: "de" | "en" = "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
type TestSite = ReturnType<typeof base>;
const withSeller = (site: TestSite, patch: Record<string, unknown>): TestSite => ({ ...site, seller: { ...site.seller, ...patch } }) as TestSite;
const withTypes = (site: TestSite, types: readonly string[], viewing: boolean): TestSite =>
  ({ ...site, typeFields: { ...site.typeFields, requestTypes: types }, viewing: viewing ? (site.viewing ?? ({} as any)) : null }) as unknown as TestSite;
const footer = (site: TestSite) => renderToStaticMarkup(<Footer site={site} />);
const typesIn = (html: string) => [...html.matchAll(/<a href="#contact" data-request-type="([a-z_]+)"/g)].map((m) => m[1]);

describe("the footer's contact links", () => {
  it("are one per request type the page offers, in the product type's order, and a type that needs viewing settings is left out without them", () => {
    const four = ["viewing", "testdrive", "question", "offer"];
    expect(typesIn(footer(withTypes(base(), four, false)))).toEqual(["question", "offer"]);
    expect(typesIn(footer(withTypes(base(), four, true)))).toEqual(four);
    expect(typesIn(footer(withTypes(base(), ["question"], false)))).toEqual(["question"]);
  });

  it("are one row: the types' links, then the e-mail (and the phone, when the seller has one), each with an icon, and no heading", () => {
    for (const lang of ["en", "de"] as const) {
      const out = footer(withTypes(base(lang), ["viewing", "testdrive", "question", "offer"], true));
      for (const type of ["viewing", "testdrive", "question", "offer"] as const) expect(out).toContain(`<span>${REQUEST_TYPES[type].label[lang]}</span>`);
      expect(out).not.toContain("site-footer__heading");
      expect(out).toContain(`role="group" aria-label="${ui("footer.contact", lang)}"`); // the block is named for assistive technology
      expect(out.match(/<ul class="site-footer__links">/g)).toHaveLength(1); // one list: one row
      expect(out.indexOf("data-request-type")).toBeLessThan(out.indexOf('href="mailto:'));
      expect((out.match(/<svg class="site-footer__icon"/g) ?? []).length).toBe(4 + 1); // four links and the e-mail
    }
  });
});

describe("the footer's city, credit and legal links come from the content", () => {
  it("the city shows under the brand in the page language, and only when the seller has one", () => {
    expect(footer(base())).not.toContain("site-footer__city");
    const city = { en: "Vienna", de: "Wien" };
    expect(footer(withSeller(base("en"), { city }))).toContain('<p class="site-footer__city">Vienna</p>');
    expect(footer(withSeller(base("de"), { city }))).toContain('<p class="site-footer__city">Wien</p>');
  });

  it("the assistant's badge (the template's emblem, two lines) shows only when the agent has a credit; a link only when it has a URL", () => {
    const agent = { id: "x", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };
    expect(footer(base())).not.toContain("site-footer__badge");
    expect(footer(withSeller(base(), { agent }))).not.toContain("site-footer__badge"); // an agent without a credit: nothing
    const plain = footer(withSeller(base("en"), { agent: { ...agent, credit: { provider: "hanc•ai" } } }));
    expect(plain).toContain("<small>AI sales assistant by</small><b>hanc•ai</b>");
    expect(plain).toContain('src="/brand/hanc-emblem.svg"');
    expect(plain).toMatch(/<span class="site-footer__badge site-footer__badge--agent">/);
    expect(plain).not.toMatch(/<a class="site-footer__badge/);
    const linked = footer(withSeller(base("de"), { agent: { ...agent, credit: { provider: "hanc•ai", url: "https://hanc.ai" } } }));
    expect(linked).toContain('<a class="site-footer__badge site-footer__badge--agent" href="https://hanc.ai" target="_blank" rel="noopener noreferrer">');
    expect(linked).toContain("<small>KI-Verkaufsberaterin von</small><b>hanc•ai</b>");
  });

  it("the developer's badge shows only when the seller has a developer credit: its name (the last word light), a link only with a URL, an icon only with one", () => {
    expect(footer(base())).not.toContain("site-footer__badge--developer");
    const plain = footer(withSeller(base("de"), { developer: { name: "GoodPoint Labs" } }));
    expect(plain).toContain("<small>Entwickelt von</small><b>GoodPoint<em> Labs</em></b>");
    expect(plain).toMatch(/<span class="site-footer__badge site-footer__badge--developer">/);
    expect(plain).not.toContain("site-footer__developer-icon");
    const full = footer({ ...withSeller(base("en"), { developer: { name: "Acme", url: "https://example.org" } }), developerIcon: '<svg viewBox="0 0 1 1"></svg>' } as TestSite);
    expect(full).toContain('<a class="site-footer__badge site-footer__badge--developer" href="https://example.org"');
    expect(full).toContain("<small>Developed by</small><b>Acme</b>");
    expect(full).toContain('<span class="site-footer__developer-icon" aria-hidden="true"><svg viewBox="0 0 1 1"></svg></span>');
  });

  it("the badges are two separate pills, no group: the assistant's in row 1, the developer's in row 2; each only when the content gives it", () => {
    expect(footer(base())).not.toContain("site-footer__badge");
    const agent = { id: "x", variant: "pill", placement: "header", credit: { provider: "p" } };
    const both = footer(withSeller(base(), { agent, developer: { name: "D" } }));
    expect(both).not.toContain("site-footer__badges");
    expect(both.indexOf("badge--agent")).toBeLessThan(both.indexOf("site-footer__bottom"));
    expect(both.indexOf("badge--developer")).toBeGreaterThan(both.indexOf("site-footer__bottom"));
  });

  it("the markup order is the phone order: logo and city, contacts, assistant's badge, note, developer's badge, legal links, version", () => {
    const agent = { id: "x", variant: "pill", placement: "header", credit: { provider: "p" } };
    const html = footer(withSeller(base("de"), { agent, developer: { name: "D" }, city: { de: "Wien", en: "Vienna" }, legalNote: { de: "Unverbindlich", en: "Non-binding" }, privacyUrl: "https://example.org/p" }));
    const at = ["site-header__brand", "site-footer__city", "site-footer__contact", "badge--agent", "site-footer__legal\"", "badge--developer", "site-footer__legal-links", "site-footer__version"].map((k) => html.indexOf(k));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("the contact links have a small heading, \"Kontakt\" / \"Contact\"", () => {
    expect(footer(base("de"))).toContain('<p class="site-footer__contact-title" aria-hidden="true">Kontakt</p>');
    expect(footer(base("en"))).toContain('>Contact</p>');
  });

  it("the brand is the header's own mark and wordmark", () => {
    const html = footer({ ...base(), logo: '<svg viewBox="0 0 1 1"></svg>' } as TestSite);
    expect(html).toContain('<span class="site-header__logo" aria-hidden="true"><svg viewBox="0 0 1 1"></svg></span>');
    expect(html).toContain('<span class="site-header__name">');
  });

  it("the legal links are the ones the seller gives: none, only one, or both in the order privacy, imprint; never a dead link", () => {
    const none = footer(base());
    expect(none).not.toContain("site-footer__legal-links");
    expect(none).not.toContain('href="undefined"');
    expect(footer(withSeller(base("en"), { imprintUrl: "https://example.org/imprint" }))).toMatch(/<nav class="site-footer__legal-links"[^>]*><span><a href="https:\/\/example\.org\/imprint">Imprint<\/a><\/span><\/nav>/);
    const both = footer(withSeller(base("de"), { privacyUrl: "https://example.org/privacy", imprintUrl: "https://example.org/imprint" }));
    expect(both.indexOf(">Datenschutz<")).toBeGreaterThan(0);
    expect(both.indexOf(">Datenschutz<")).toBeLessThan(both.indexOf(">Impressum<"));
  });

  it("the new seller fields are validated (city is localized, the credit needs a provider and an http(s) URL)", () => {
    const seller = JSON.parse(JSON.stringify(sellerFixture()));
    expect(sellerSchema.safeParse({ ...seller, city: { en: "Vienna", de: "Wien" }, agent: { ...seller.agent, credit: { provider: "hanc•ai", url: "https://hanc.ai" } } }).success).toBe(true);
    expect(sellerSchema.safeParse({ ...seller, agent: { id: "x", credit: { provider: "" } } }).success).toBe(false);
    expect(sellerSchema.safeParse({ ...seller, agent: { id: "x", credit: { provider: "p", url: "ftp://x" } } }).success).toBe(false);
    expect(sellerSchema.safeParse({ ...seller, developer: { name: "D", url: "https://example.org", icon: "mark.svg" } }).success).toBe(true);
    expect(sellerSchema.safeParse({ ...seller, developer: { name: "" } }).success).toBe(false);
    expect(sellerSchema.safeParse({ ...seller, developer: { name: "D", icon: "../mark.svg" } }).success).toBe(false); // a file next to seller.json only
  });
});

function sellerFixture() {
  const s = base().seller as any;
  const { agent: _agent, ...rest } = s;
  void _agent;
  return { ...rest, agent: { id: "x", variant: "pill", placement: "header" } };
}

describe("the prototype line is gone", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("there is no prototype text or string, and the quiet version line is always there (also without the prototype flag)", () => {
    expect(UI_KEYS).not.toContain("footer.prototype");
    for (const flag of ["", "1"]) {
      vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_NOTE", flag);
      const out = footer(base());
      expect(out).toContain('<p class="site-footer__version">');
      expect(out).not.toMatch(/prototype/i);
    }
  });
});

describe("a click on a contact link opens the form on that tab", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
  });
  it("each link of the footer", () => {
    const site = buildSite(null, examples.ref("example-house"), examples.root, "en"); // an example with viewing settings, so all four types are offered
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    act(() => root!.render(<ProductLayout site={site} />));
    const links = [...box.querySelectorAll<HTMLAnchorElement>("footer a[data-request-type]")];
    expect(links.map((l) => l.dataset.requestType)).toEqual(site.typeFields.requestTypes.filter((t) => t !== "viewing" || site.viewing !== null));
    expect(links.length).toBeGreaterThanOrEqual(3);
    const dialog = () => box!.querySelector("dialog.contact-dialog") as HTMLDialogElement;
    for (const link of links) {
      act(() => void link.click());
      const select = { value: selectedType(box) };
      expect(select.value, link.dataset.requestType).toBe(link.dataset.requestType);
      expect(dialog().hasAttribute("open") || dialog().open).toBe(true);
      act(() => void dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    }
  });
});
