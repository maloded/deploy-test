// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ownerMessage, OWNER_MESSAGE_MAX, requestNumber } from "@/lib/owner-message";
import { leadRecordSchema } from "@/lib/leads";
import { FAKE_OWNER, FAKE_RECORD } from "./telegram-fakes";

const PERSONAL = ["Jane Example", "jane@example.invalid", "+00 000 000 000", "second floor", "2026-06-11", "10:00", "15:00", "Morning", "Vormittags", "09:00\u201312:00"];

describe("the owner message", () => {
  it("the fake record is a valid lead record", () => {
    expect(leadRecordSchema.safeParse(FAKE_RECORD).success).toBe(true);
  });

  it("full, in English: the header, the contact block, the times, the note, the consent, the time", () => {
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("en"))).toBe(
      [
        "New request #0A1B2C3D",
        "Type: Viewing",
        "Source: Form (website)",
        "Product: Example house (example-seller/example-house)",
        "Page language: Deutsch",
        "",
        "Name: Jane Example",
        "E-mail: jane@example.invalid",
        "Phone: +00 000 000 000",
        "Preferred channel: Phone",
        "Contact window: Morning (09:00–12:00)",
        "",
        "Preferred times (seller's local time):",
        "1. Thu, 11/06/2026, 10:00",
        "2. Sat, 13/06/2026, 15:00",
        "",
        "Message:",
        "Is the second floor accessible?",
        "",
        "Consent: version 2026-06-01 · SHA-256 000000000000",
        "Received: 2026-06-10 12:05 (Vienna) · 10:05 UTC",
      ].join("\n"),
    );
  });

  it("full, in German", () => {
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("de"))).toBe(
      [
        "Neue Anfrage #0A1B2C3D",
        "Art: Besichtigung",
        "Quelle: Formular (Website)",
        "Produkt: Beispielhaus (example-seller/example-house)",
        "Seitensprache: Deutsch",
        "",
        "Name: Jane Example",
        "E-Mail: jane@example.invalid",
        "Telefon: +00 000 000 000",
        "Bevorzugter Kanal: Telefon",
        "Erreichbarkeit: Vormittags (09:00–12:00)",
        "",
        "Wunschtermine (Ortszeit des Verkäufers):",
        "1. Do., 11.06.2026, 10:00",
        "2. Sa., 13.06.2026, 15:00",
        "",
        "Nachricht:",
        "Is the second floor accessible?",
        "",
        "Einwilligung: Version 2026-06-01 · SHA-256 000000000000",
        "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
      ].join("\n"),
    );
  });

  it("short, in English and German: the same header and time, no personal field, no consent", () => {
    expect(ownerMessage(FAKE_RECORD, "short", FAKE_OWNER("en"))).toBe([
      "New request #0A1B2C3D",
      "Type: Viewing",
      "Source: Form (website)",
      "Product: Example house (example-seller/example-house)",
      "Page language: Deutsch",
      "",
      "Received: 2026-06-10 12:05 (Vienna) · 10:05 UTC",
      "Details: see your lead store.",
    ].join("\n"));
    expect(ownerMessage(FAKE_RECORD, "short", FAKE_OWNER("de"))).toBe([
      "Neue Anfrage #0A1B2C3D",
      "Art: Besichtigung",
      "Quelle: Formular (Website)",
      "Produkt: Beispielhaus (example-seller/example-house)",
      "Seitensprache: Deutsch",
      "",
      "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
      "Einzelheiten: siehe Ihr Anfragenspeicher.",
    ].join("\n"));
  });

  it("short contains none of the personal fields, whatever the record holds", () => {
    for (const lang of ["de", "en"] as const) {
      const text = ownerMessage(FAKE_RECORD, "short", FAKE_OWNER(lang));
      for (const value of [FAKE_RECORD.name, FAKE_RECORD.email, FAKE_RECORD.phone!, FAKE_RECORD.message!, ...PERSONAL]) expect(text).not.toContain(value);
      expect(text).not.toContain("@");
    }
  });

  it("full shows e-mail and phone always, with a dash for what the visitor did not give, and the channel as 'no preference' when there is none; no question, no note without text", () => {
    const text = ownerMessage({ ...FAKE_RECORD, type: "question", email: undefined, phone: undefined, channel: undefined, message: undefined, slots: undefined }, "full", FAKE_OWNER("de"));
    expect(text.split("\n")).toEqual([
      "Neue Anfrage #0A1B2C3D", "Art: Frage", "Quelle: Formular (Website)", "Produkt: Beispielhaus (example-seller/example-house)", "Seitensprache: Deutsch", "",
      "Name: Jane Example", "E-Mail: –", "Telefon: –", "Bevorzugter Kanal: Keine Präferenz", "Erreichbarkeit: Vormittags (09:00–12:00)", "",
      "Einwilligung: Version 2026-06-01 · SHA-256 000000000000", "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
    ]);
  });

  it("cuts the message to 500 characters in the full format", () => {
    const text = ownerMessage({ ...FAKE_RECORD, message: "m".repeat(900) }, "full", FAKE_OWNER("en"));
    expect(text).toContain("Message:\n" + "m".repeat(OWNER_MESSAGE_MAX) + "\n");
    expect(text).not.toContain("m".repeat(OWNER_MESSAGE_MAX + 1));
  });

  it("the request number is the first eight characters of the id, upper case", () => {
    expect(requestNumber(FAKE_RECORD.id)).toBe("0A1B2C3D");
  });

  it("the window line shows the localized label with its hours, never the raw code, and is there for anytime too", () => {
    const line = (code: string, lang: "de" | "en") => ownerMessage({ ...FAKE_RECORD, contactWindow: code }, "full", FAKE_OWNER(lang)).split("\n").find((l) => /^(Contact window|Erreichbarkeit):/.test(l));
    expect(line("anytime", "en")).toBe("Contact window: Any time");
    expect(line("anytime", "de")).toBe("Erreichbarkeit: Jederzeit");
    expect(line("evening", "de")).toBe("Erreichbarkeit: Abends (17:00\u201320:00)");
    expect(line("afternoon", "en")).toBe("Contact window: Afternoon (12:00\u201317:00)");
    expect(line("night", "en")).toBe("Contact window: Any time"); // an unknown code reads as anytime, not as the code
    for (const code of ["anytime", "morning", "afternoon", "evening", "night"]) for (const lang of ["de", "en"] as const) expect(line(code, lang)).not.toContain(code === "anytime" ? "anytime" : code);
  });

  it("uses the seller's own windows for the label", () => {
    const windows = [{ code: "anytime", label: { en: "Whenever" } }, { code: "lunch", from: "12:00", to: "14:00", label: { en: "Lunch break (12:00\u201314:00)" } }];
    const text = ownerMessage({ ...FAKE_RECORD, contactWindow: "lunch" }, "full", { lang: "en", windows });
    expect(text).toContain("Contact window: Lunch break (12:00\u201314:00)");
  });

  it("the product line falls back to the reference alone without a title (or with a title equal to it)", () => {
    expect(ownerMessage(FAKE_RECORD, "full", { lang: "en" })).toContain("\nProduct: example-seller/example-house\n");
    expect(ownerMessage(FAKE_RECORD, "short", { lang: "de", productTitle: `${FAKE_RECORD.seller}/${FAKE_RECORD.product}` })).toContain("\nProdukt: example-seller/example-house\n");
  });

  const OFFER = { ...FAKE_RECORD, type: "offer" as const, slots: undefined, message: undefined, amount: 49500.5, currency: "EUR" };

  it("an offer shows the offer, the asking price and the difference in the product's currency and the seller's language; an offer above the price has a plus, one at the price a plus-minus", () => {
    const de = (r: Parameters<typeof ownerMessage>[0]) => ownerMessage(r, "full", { ...FAKE_OWNER("de"), price: 53900 }).split("\n\n")[2];
    expect(de(OFFER)).toBe("Angebot: 49.500,50 €\nPreis: 53.900 €\nDifferenz: −4.399,50 € (−8,2 %)");
    expect(de({ ...OFFER, amount: 53900 })).toBe("Angebot: 53.900 €\nPreis: 53.900 €\nDifferenz: ±0 € (±0,0 %)");
    expect(de({ ...OFFER, amount: 59290 })).toBe("Angebot: 59.290 €\nPreis: 53.900 €\nDifferenz: +5.390 € (+10,0 %)");
    expect(ownerMessage({ ...OFFER, amount: 50000 }, "full", { ...FAKE_OWNER("en"), price: 53900 })).toContain("Offer: €50,000\nPrice: €53,900\nDifference: −€3,900 (−7.2%)");
    expect(ownerMessage({ ...OFFER, amount: 50000, currency: "CHF" }, "full", { ...FAKE_OWNER("de"), price: 53900 })).toContain("Angebot: 50.000 CHF\nPreis: 53.900 CHF"); // the product's currency, not euros
  });

  it("without a known price (a price that is per month, say) the offer is shown alone, with no price and no difference", () => {
    const text = ownerMessage(OFFER, "full", FAKE_OWNER("de"));
    expect(text).toContain("Angebot: 49.500,50 €\n");
    expect(text).not.toMatch(/\nPreis:|Differenz/);
  });

  it("an offer the agent took without an amount says it was agreed in the call, with the agent's name, and still shows the price", () => {
    const text = ownerMessage({ ...OFFER, amount: undefined, source: "agent" }, "full", { ...FAKE_OWNER("de"), price: 53900, agentName: "Nora" });
    expect(text).toContain("Quelle: Nora (Agent)\n");
    expect(text).toContain("\n\nBetrag: im Gespräch mit Nora\nPreis: 53.900 €\n\n");
    expect(text).not.toContain("Differenz");
    expect(ownerMessage({ ...OFFER, amount: undefined, source: "agent" }, "full", { ...FAKE_OWNER("en"), agentName: "Nora" })).toContain("Amount: with Nora in the call");
  });

  it("without an agent name the agent is called by a plain word, in every language", () => {
    const agent = { ...FAKE_RECORD, source: "agent" as const, slots: undefined };
    expect(ownerMessage(agent, "full", FAKE_OWNER("de"))).toContain("Quelle: Sprachagent\n");
    expect(ownerMessage(agent, "full", FAKE_OWNER("de"))).toContain("Termin: im Gespräch mit dem Sprachagenten vereinbart – siehe Kalender");
    expect(ownerMessage(agent, "full", FAKE_OWNER("en"))).toContain("Source: Voice agent\n");
    expect(ownerMessage(agent, "full", { lang: "tr" })).toContain("Kaynak: Sesli asistan\n");
    expect(ownerMessage(agent, "full", { lang: "bg" })).toContain("Източник: Гласов агент\n");
  });

  it("the agent's request with no times says it was arranged in the call; with times, they are the fall-back times; the web form's are the preferred times", () => {
    const owner = { ...FAKE_OWNER("de"), agentName: "Nora" };
    const none = ownerMessage({ ...FAKE_RECORD, source: "agent", slots: undefined }, "full", owner);
    expect(none).toContain("\n\nTermin: im Gespräch mit Nora vereinbart – siehe Kalender\n\n");
    expect(none).not.toContain("Wunschtermine");
    const some = ownerMessage({ ...FAKE_RECORD, source: "agent" }, "full", owner);
    expect(some).toContain("\n\nAusweichtermine (vereinbarter Termin: siehe Kalender):\n1. Do., 11.06.2026, 10:00\n2. Sa., 13.06.2026, 15:00\n\n");
    expect(some).not.toContain("Wunschtermine");
    expect(ownerMessage(FAKE_RECORD, "full", owner)).toContain("Wunschtermine (Ortszeit des Verkäufers):\n1. Do.");
    // only a viewing or a test drive has times; a question from the agent says nothing about them
    expect(ownerMessage({ ...FAKE_RECORD, type: "question", source: "agent", slots: undefined }, "full", owner)).not.toMatch(/Termin/);
  });

  it("the question of a question request has the heading 'Frage:', any other note 'Nachricht:'", () => {
    expect(ownerMessage({ ...FAKE_RECORD, type: "question", slots: undefined }, "full", FAKE_OWNER("de"))).toContain("\n\nFrage:\nIs the second floor accessible?\n\n");
    expect(ownerMessage({ ...FAKE_RECORD, type: "question", slots: undefined }, "full", FAKE_OWNER("en"))).toContain("\n\nQuestion:\nIs the second floor accessible?\n\n");
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("de"))).toContain("\n\nNachricht:\n");
  });

  it("the consent line has the version label and the first 12 characters of the hash, never the whole hash", () => {
    const text = ownerMessage({ ...FAKE_RECORD, consentVersion: "unversioned", consentTextSha256: "ab12cd34ef56" + "0".repeat(52) }, "full", FAKE_OWNER("de"));
    expect(text).toContain("Einwilligung: Version unversioned · SHA-256 ab12cd34ef56\n");
    expect(text).not.toContain("ab12cd34ef560");
  });

  it("the short message has no amount, no consent, no times and no contact, from the agent too", () => {
    for (const record of [{ ...OFFER, source: "agent" as const }, { ...FAKE_RECORD, source: "agent" as const }]) {
      const text = ownerMessage(record, "short", { ...FAKE_OWNER("de"), price: 53900, agentName: "Nora" });
      expect(text).toContain("Quelle: Nora (Agent)");
      expect(text).not.toMatch(/Betrag|Angebot:|Angebotspreis|Einwilligung|SHA|Termin|Jane|invalid|\+00/);
    }
  });

  it("phone only or e-mail only: the contact block shows both lines, a dash for the one that is not there, nothing says undefined", () => {
    const phoneOnly = ownerMessage({ ...FAKE_RECORD, email: undefined }, "full", FAKE_OWNER("en"));
    expect(phoneOnly).toContain("E-mail: –\nPhone: +00 000 000 000");
    const mailOnly = ownerMessage({ ...FAKE_RECORD, phone: undefined, channel: undefined }, "full", FAKE_OWNER("en"));
    expect(mailOnly).toContain("E-mail: jane@example.invalid\nPhone: –\nPreferred channel: No preference");
    expect(phoneOnly + mailOnly).not.toContain("undefined");
  });

  it("the time line: local time with the city in brackets, then UTC; UTC only without a zone; follows daylight saving", () => {
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("de"))).toContain("Eingegangen: 2026-06-10 12:05 (Wien) \u00b7 10:05 UTC");
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("en"))).toContain("Received: 2026-06-10 12:05 (Vienna) \u00b7 10:05 UTC");
    expect(ownerMessage({ ...FAKE_RECORD, timezone: undefined }, "short", { lang: "de" })).toContain("Eingegangen: 2026-06-10 10:05 UTC\n");
    expect(ownerMessage({ ...FAKE_RECORD, createdAt: "2026-01-10T10:05:00.000Z" }, "short", FAKE_OWNER("en"))).toContain("Received: 2026-01-10 11:05 (Vienna) \u00b7 10:05 UTC");
    expect(ownerMessage({ ...FAKE_RECORD, timezone: "Asia/Tokyo" }, "short", FAKE_OWNER("en"))).toContain("Received: 2026-06-10 19:05 (Tokyo) \u00b7 10:05 UTC");
  });
});
