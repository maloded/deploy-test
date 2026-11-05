// @vitest-environment node
import { describe, expect, it } from "vitest";
import { channelAvailable, validEmail, validPhone } from "@/lib/lead";
import { LANGUAGES, localeOf } from "@/lib/languages";
import { formatAmountInput, parseAmount, separatorsOf } from "@/lib/offer-amount";
import { bookableDays } from "@/lib/viewing";

describe("how a language writes numbers (separatorsOf)", () => {
  it("German, Turkish and Bulgarian: the comma is the decimal separator; English: the dot", () => {
    for (const lang of LANGUAGES) {
      const { decimal, group } = separatorsOf(localeOf(lang));
      expect(decimal, lang).toBe(lang === "en" ? "." : ",");
      expect(group, lang).not.toBe(decimal);
    }
    expect(separatorsOf("not-a-locale-at-all-!!")).toEqual({ decimal: ",", group: "." }); // never throws
  });
});

describe("parseAmount by the page language", () => {
  const read = (value: string, lang: (typeof LANGUAGES)[number]) => parseAmount(value, localeOf(lang));
  it("where the comma is decimal (de, tr, bg): '50.000' is fifty thousand, '49500,5' 49,500.5, '49.500,50' 49,500.5", () => {
    for (const lang of LANGUAGES.filter((l) => l !== "en")) {
      expect(read("50.000", lang), lang).toBe(50000);
      expect(read("49500,5", lang), lang).toBe(49500.5);
      expect(read("49.500,50", lang), lang).toBe(49500.5);
    }
  });
  it("in English: '50,000' is fifty thousand, '49,500.50' 49,500.5, '49500.5' the same", () => {
    expect(read("50,000", "en")).toBe(50000);
    expect(read("49,500.50", "en")).toBe(49500.5);
    expect(read("49500.5", "en")).toBe(49500.5);
  });
  it("spaces of any kind, and no separator at all, read the same in every language", () => {
    for (const lang of LANGUAGES) for (const typed of ["50000", "50 000", "50 000", "50 000", " 50000 "]) expect(read(typed, lang), `${lang} ${JSON.stringify(typed)}`).toBe(50000);
  });
  it("is NaN for what is no number, whatever the language: nothing, letters, signs, two decimals, a bare separator", () => {
    for (const lang of LANGUAGES) for (const bad of ["", "  ", "abc", "5o", "-5", "+5", "1e5", "0x10", "5;5", ",", "."]) expect(read(bad, lang), `${lang} ${JSON.stringify(bad)}`).toBeNaN();
  });
  it("takes a number as it is, and anything else for none", () => {
    expect(parseAmount(50000.5)).toBe(50000.5);
    for (const bad of [null, undefined, {}, [], true]) expect(parseAmount(bad)).toBeNaN();
  });
  it("defaults to the German way", () => {
    expect(parseAmount("50.000")).toBe(50000);
  });
});

describe("formatAmountInput: the amount shown back as the language writes it", () => {
  it("de, tr and bg group with a dot (bg: a space where its grouping starts), en with a comma; the decimals keep the language's separator", () => {
    expect(formatAmountInput("500000", localeOf("de"))).toBe("500.000");
    expect(formatAmountInput("49500,5", localeOf("de"))).toBe("49.500,5");
    expect(formatAmountInput("500000", localeOf("tr"))).toBe("500.000");
    expect(formatAmountInput("500000", localeOf("en"))).toBe("500,000");
    expect(formatAmountInput("49500.5", localeOf("en"))).toBe("49,500.5");
    expect(parseAmount(formatAmountInput("500000", localeOf("bg")), localeOf("bg"))).toBe(500000);
  });
  it("is the same number read back, in every language, for any amount (a round trip)", () => {
    for (const lang of LANGUAGES) for (const n of [800, 1000, 49500.5, 53900, 1234567.25, 0.5]) expect(parseAmount(formatAmountInput(String(n).replace(".", separatorsOf(localeOf(lang)).decimal), localeOf(lang)), localeOf(lang)), `${lang} ${n}`).toBe(n);
  });
  it("leaves what is no number (or not above zero) as it was typed", () => {
    expect(formatAmountInput("abc", "de-DE")).toBe("abc");
    expect(formatAmountInput("", "de-DE")).toBe("");
    expect(formatAmountInput("0", "de-DE")).toBe("0");
  });
});

describe("what the channel chips need", () => {
  it("validEmail and validPhone are the schema's checks", () => {
    expect([validEmail("person@example.invalid"), validEmail(" person@example.invalid "), validEmail("person@example"), validEmail("person"), validEmail(""), validEmail(5)]).toEqual([true, true, false, false, false, false]);
    expect([validPhone("+00 000 000 000"), validPhone("(0)1/234-56"), validPhone("abc"), validPhone("12"), validPhone(""), validPhone(undefined)]).toEqual([true, true, false, false, false, false]);
  });
  it("no preference is always usable; e-mail needs a valid address; every other channel a valid phone number", () => {
    const none = { email: "", phone: "" };
    expect(channelAvailable("", none)).toBe(true);
    for (const c of ["email", "phone", "whatsapp", "telegram"]) expect(channelAvailable(c, none), c).toBe(false);
    expect(channelAvailable("email", { email: "person@example.invalid", phone: "" })).toBe(true);
    expect(channelAvailable("phone", { email: "person@example.invalid", phone: "" })).toBe(false);
    for (const c of ["phone", "whatsapp", "telegram"]) expect(channelAvailable(c, { email: "", phone: "+00 000 000 000" }), c).toBe(true);
    expect(channelAvailable("email", { email: "", phone: "+00 000 000 000" })).toBe(false);
  });
});

describe("bookableDays: the picker's strip", () => {
  const config = { timezone: "Europe/Vienna", days: ["tue", "thu", "sat"] as ("tue" | "thu" | "sat")[] };
  const wed = new Date("2026-06-10T10:00:00Z");
  it("the days with visits from tomorrow on, at most as many as asked for, none beyond the 60-day horizon", () => {
    expect(bookableDays(config, 4, wed)).toEqual(["2026-06-11", "2026-06-13", "2026-06-16", "2026-06-18"]);
    expect(bookableDays(config, 200, wed).at(-1)! <= "2026-08-09").toBe(true);
    expect(bookableDays(config, 200, wed)).toHaveLength(26); // 60 days of Tue, Thu and Sat
    expect(bookableDays(config, 0, wed)).toEqual([]);
  });
  it("follows the seller's calendar: at 00:01 on the 11th in Vienna tomorrow is the 12th", () => {
    expect(bookableDays(config, 2, new Date("2026-06-10T22:01:00Z"))).toEqual(["2026-06-13", "2026-06-16"]);
  });
  it("is empty without a day of the week", () => {
    expect(bookableDays({ timezone: "Europe/Vienna", days: [] }, 5, wed)).toEqual([]);
  });
});
