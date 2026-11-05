// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatMoney, formatPrice } from "@/lib/i18n";
import { roleLine, spokenName } from "@/lib/avatar-view";
import { getFormSnapshot } from "@/lib/form-snapshot";
import { buildPageContext } from "@/lib/agent-context";
import { ogLocale } from "@/lib/social-meta";
import { AI_DRAFT_LANGUAGES, ui } from "@/lib/ui-strings";
import { validateSeller } from "@/lib/seller";
import { fixtures } from "./helpers";

const NBSP = " ";

describe("money in the four languages", () => {
  it("puts the symbol after the number in de, tr and bg (as the reference site does) and before it in en", () => {
    expect(formatMoney(53900, "EUR", "de")).toBe(`53.900${NBSP}€`);
    expect(formatMoney(53900, "EUR", "tr")).toBe(`53.900${NBSP}€`);
    expect(formatMoney(53900, "EUR", "bg")).toBe(`53${NBSP}900${NBSP}€`.replace(/^53 900/, (m) => m)); // CLDR groups bg with a no-break space
    expect(formatMoney(53900, "EUR", "en")).toBe("€53,900");
  });

  it("keeps the price label's per-period text and a minus sign in front", () => {
    expect(formatPrice(589, "EUR", "month", "tr")).toBe(`589${NBSP}€ / ay`);
    expect(formatPrice(589, "EUR", "month", "bg")).toBe(`589${NBSP}€ / месец`);
    expect(formatMoney(-1500, "EUR", "tr")).toBe(`-1.500${NBSP}€`);
  });
});

describe("the page metadata of tr and bg", () => {
  it("has tr_TR and bg_BG Open Graph locales", () => {
    expect(ogLocale("tr")).toBe("tr_TR");
    expect(ogLocale("bg")).toBe("bg_BG");
  });

  it("reports the page language in page_context", () => {
    const snapshot = getFormSnapshot();
    for (const language of ["tr", "bg"]) expect(buildPageContext({ language, product: "p", path: `/${language}`, title: "t", snapshot }).language).toBe(language);
  });
});

describe("the assistant's spoken languages", () => {
  const avatar = (languages: string[]) => ({ role: { en: "Sales Rep", de: "Verkaufsberaterin", tr: "Satış danışmanı", bg: "Консултант" } as never, languages });

  it("shows the languages the seller lists, not the page languages: Russian is shown without being a page language, Turkish is absent", () => {
    expect(roleLine(avatar(["de", "en", "ru", "bg"]), "tr", true)).toBe("Satış danışmanı · DE, EN, RU, BG");
    expect(roleLine(avatar(["de", "en", "ru", "bg"]), "bg", true)).toBe("Консултант · DE, EN, RU, BG");
    expect(roleLine(avatar(["de", "en", "ru", "bg"]), "tr")).toBe("Satış danışmanı · Deutsch, English, Русский, Български");
  });

  it("names a language outside the registry in its own language, with a capital", () => {
    expect(spokenName("ru")).toBe("Русский");
    expect(spokenName("fr")).toBe("Français");
  });

  it("accepts agent.avatar.languages in seller.json (two-letter codes) and rejects anything else", () => {
    const seller = JSON.parse(JSON.stringify(fixtures.sellerJson()));
    seller.agent = { id: "test-agent-id", avatar: { id: "sofia", languages: ["de", "en", "ru", "bg"] } };
    expect(validateSeller(seller).ok).toBe(true);
    for (const bad of [["deu"], ["DE"], [], ["de", 1]]) {
      seller.agent.avatar.languages = bad;
      expect(validateSeller(seller).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("the new texts are marked as AI drafts", () => {
  it("lists de, tr and bg as drafts until a native speaker has read them", () => {
    expect([...AI_DRAFT_LANGUAGES]).toEqual(["de", "tr", "bg"]);
  });

  it("has Turkish and Bulgarian UI text that keeps the placeholders of the English one", () => {
    for (const lang of ["tr", "bg"] as const) {
      expect(ui("gallery.slide", lang)).toMatch(/\{n\}/);
      expect(ui("gallery.slide", lang)).toMatch(/\{total\}/);
    }
    expect(ui("section.faq", "tr")).toBe("Sorular ve yanıtlar");
    expect(ui("section.faq", "bg")).toBe("Въпроси и отговори");
  });
});
