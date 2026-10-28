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

  it("full, in English", () => {
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("en"))).toBe(
      [
        "New request #0A1B2C3D",
        "Type: Viewing",
        "Product: Example house (example-seller/example-house)",
        "Page language: Deutsch",
        "Name: Jane Example",
        "E-mail: jane@example.invalid",
        "Phone: +00 000 000 000",
        "Preferred channel: Phone",
        "Contact window: Morning (09:00–12:00)",
        "Message: Is the second floor accessible?",
        "Preferred times (seller's local time):",
        "- 2026-06-11 10:00",
        "- 2026-06-13 15:00",
        "Received: 2026-06-10 12:05 (Vienna) · 10:05 UTC",
      ].join("\n"),
    );
  });

  it("full, in German", () => {
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("de"))).toBe(
      [
        "Neue Anfrage #0A1B2C3D",
        "Art: Besichtigung",
        "Produkt: Beispielhaus (example-seller/example-house)",
        "Seitensprache: Deutsch",
        "Name: Jane Example",
        "E-Mail: jane@example.invalid",
        "Telefon: +00 000 000 000",
        "Bevorzugter Kanal: Telefon",
        "Erreichbarkeit: Vormittags (09:00–12:00)",
        "Nachricht: Is the second floor accessible?",
        "Wunschtermine (Ortszeit des Verkäufers):",
        "- 2026-06-11 10:00",
        "- 2026-06-13 15:00",
        "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
      ].join("\n"),
    );
  });

  it("short, in English and German: the same product and time lines, no personal field", () => {
    expect(ownerMessage(FAKE_RECORD, "short", FAKE_OWNER("en"))).toBe([
      "New request #0A1B2C3D",
      "Type: Viewing",
      "Product: Example house (example-seller/example-house)",
      "Page language: Deutsch",
      "Received: 2026-06-10 12:05 (Vienna) · 10:05 UTC",
      "Details: see your lead store.",
    ].join("\n"));
    expect(ownerMessage(FAKE_RECORD, "short", FAKE_OWNER("de"))).toBe([
      "Neue Anfrage #0A1B2C3D",
      "Art: Besichtigung",
      "Produkt: Beispielhaus (example-seller/example-house)",
      "Seitensprache: Deutsch",
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

  it("full leaves out the optional lines the visitor did not fill in", () => {
    const text = ownerMessage({ ...FAKE_RECORD, requestType: "question", phone: undefined, channel: undefined, message: undefined, preferredSlots: undefined }, "full", FAKE_OWNER("en"));
    // the product line carries the title, the window line is always there, the time line has the zone of the record
    expect(text.split("\n")).toEqual(["New request #0A1B2C3D", "Type: Question", "Product: Example house (example-seller/example-house)", "Page language: Deutsch", "Name: Jane Example", "E-mail: jane@example.invalid", "Contact window: Morning (09:00\u201312:00)", "Received: 2026-06-10 12:05 (Vienna) \u00b7 10:05 UTC"]);
  });

  it("cuts the message to 500 characters in the full format", () => {
    const text = ownerMessage({ ...FAKE_RECORD, message: "m".repeat(900) }, "full", FAKE_OWNER("en"));
    expect(text).toContain("Message: " + "m".repeat(OWNER_MESSAGE_MAX) + "\n");
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
    expect(ownerMessage(FAKE_RECORD, "short", { lang: "de", productTitle: FAKE_RECORD.product })).toContain("\nProdukt: example-seller/example-house\n");
  });

  it("the time line: local time with the city in brackets, then UTC; UTC only without a zone; follows daylight saving", () => {
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("de"))).toContain("Eingegangen: 2026-06-10 12:05 (Wien) \u00b7 10:05 UTC");
    expect(ownerMessage(FAKE_RECORD, "full", FAKE_OWNER("en"))).toContain("Received: 2026-06-10 12:05 (Vienna) \u00b7 10:05 UTC");
    expect(ownerMessage({ ...FAKE_RECORD, timezone: undefined }, "short", { lang: "de" })).toContain("Eingegangen: 2026-06-10 10:05 UTC\n");
    expect(ownerMessage({ ...FAKE_RECORD, receivedAt: "2026-01-10T10:05:00.000Z" }, "short", FAKE_OWNER("en"))).toContain("Received: 2026-01-10 11:05 (Vienna) \u00b7 10:05 UTC");
    expect(ownerMessage({ ...FAKE_RECORD, timezone: "Asia/Tokyo" }, "short", FAKE_OWNER("en"))).toContain("Received: 2026-06-10 19:05 (Tokyo) \u00b7 10:05 UTC");
  });
});
