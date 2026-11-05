// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LeadRecord } from "@/lib/leads";
import { ownerMessage } from "@/lib/owner-message";
import { FAKE_RECORD } from "./telegram-fakes";

// Golden messages: the whole text the seller reads in the chat, per kind of request, from the form and from the voice agent, and the short one. German, the seller's language;
// every name, address, number and hash below is invented. A change of wording or layout shows up here as a diff, on purpose.

const base: LeadRecord = {
  ...FAKE_RECORD,
  seller: "beispiel-autohaus",
  product: "beispielwagen",
  name: "Erika Beispiel",
  email: "erika@example.invalid",
  phone: "+00 000 000 111",
  channel: "email",
  contactWindow: "afternoon",
  message: undefined,
  slots: undefined,
  consentVersion: "2026-06-01-draft",
  consentTextSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
};
const slots = [
  { date: "2026-06-11", time: "10:00", start: "2026-06-11T10:00:00+02:00" },
  { date: "2026-06-16", time: "14:30", start: "2026-06-16T14:30:00+02:00" },
];
/** The seller's side: German, the product's title and asking price (53,900 EUR), the voice agent's name. */
const owner = { lang: "de" as const, productTitle: "Beispielwagen 2.0 TDI", price: 53900, agentName: "Nora" };

const records: Record<string, Partial<LeadRecord>> = {
  "viewing-form": { type: "viewing", source: "form", slots, message: "Ist das Fahrzeug unfallfrei?" },
  "viewing-agent": { type: "viewing", source: "agent", slots: undefined },
  "testdrive-form": { type: "testdrive", source: "form", slots: slots.slice(0, 1), phone: undefined },
  "testdrive-agent": { type: "testdrive", source: "agent", slots: slots.slice(1) },
  "question-form": { type: "question", source: "form", email: undefined, channel: undefined, message: "Wie hoch ist der Verbrauch im Alltag?" },
  "question-agent": { type: "question", source: "agent", email: undefined, channel: undefined },
  "offer-form": { type: "offer", source: "form", amount: 49500.5, currency: "EUR", message: "Barzahlung möglich." },
  "offer-agent": { type: "offer", source: "agent", currency: "EUR" },
};

const golden: Record<string, string> = {
  "viewing-form": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Besichtigung",
    "Quelle: Formular (Website)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: erika@example.invalid",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: E-Mail",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Wunschtermine (Ortszeit des Verkäufers):",
    "1. Do., 11.06.2026, 10:00",
    "2. Di., 16.06.2026, 14:30",
    "",
    "Nachricht:",
    "Ist das Fahrzeug unfallfrei?",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "viewing-agent": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Besichtigung",
    "Quelle: Nora (Agent)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: erika@example.invalid",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: E-Mail",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Termin: im Gespräch mit Nora vereinbart – siehe Kalender",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "testdrive-form": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Probefahrt",
    "Quelle: Formular (Website)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: erika@example.invalid",
    "Telefon: –",
    "Bevorzugter Kanal: E-Mail",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Wunschtermine (Ortszeit des Verkäufers):",
    "1. Do., 11.06.2026, 10:00",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "testdrive-agent": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Probefahrt",
    "Quelle: Nora (Agent)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: erika@example.invalid",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: E-Mail",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Ausweichtermine (vereinbarter Termin: siehe Kalender):",
    "1. Di., 16.06.2026, 14:30",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "question-form": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Frage",
    "Quelle: Formular (Website)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: –",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: Keine Präferenz",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Frage:",
    "Wie hoch ist der Verbrauch im Alltag?",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "question-agent": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Frage",
    "Quelle: Nora (Agent)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: –",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: Keine Präferenz",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "offer-form": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Preisangebot",
    "Quelle: Formular (Website)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: erika@example.invalid",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: E-Mail",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Angebot: 49.500,50 €",
    "Preis: 53.900 €",
    "Differenz: −4.399,50 € (−8,2 %)",
    "",
    "Nachricht:",
    "Barzahlung möglich.",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "offer-agent": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Preisangebot",
    "Quelle: Nora (Agent)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Name: Erika Beispiel",
    "E-Mail: erika@example.invalid",
    "Telefon: +00 000 000 111",
    "Bevorzugter Kanal: E-Mail",
    "Erreichbarkeit: Nachmittags (12:00–17:00)",
    "",
    "Betrag: im Gespräch mit Nora",
    "Preis: 53.900 €",
    "",
    "Einwilligung: Version 2026-06-01-draft · SHA-256 9f86d081884c",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
  ].join("\n"),
  "short": [
    "Neue Anfrage #0A1B2C3D",
    "Art: Preisangebot",
    "Quelle: Nora (Agent)",
    "Produkt: Beispielwagen 2.0 TDI (beispiel-autohaus/beispielwagen)",
    "Seitensprache: Deutsch",
    "",
    "Eingegangen: 2026-06-10 12:05 (Wien) · 10:05 UTC",
    "Einzelheiten: siehe Ihr Anfragenspeicher.",
  ].join("\n"),
};

describe("the owner message, golden texts (German, invented data)", () => {
  it.each(Object.keys(records))("%s", (key) => {
    expect(ownerMessage({ ...base, ...records[key] } as LeadRecord, "full", owner)).toBe(golden[key]);
  });

  it("short: the header and the time only, from the agent's offer too: no name, no amount, no consent", () => {
    expect(ownerMessage({ ...base, type: "offer", source: "agent", amount: 49500.5, currency: "EUR" } as LeadRecord, "short", owner)).toBe(golden.short);
    for (const key of Object.keys(records)) {
      const text = ownerMessage({ ...base, ...records[key] } as LeadRecord, "short", owner);
      expect(text, key).not.toMatch(/Erika|erika|\+00|Einwilligung|SHA|\nPreis:|Differenz|Betrag|Wunschtermine|Termin:|Barzahlung|Verbrauch|unfallfrei/);
    }
  });

  it("every golden text is plain: no undefined, no raw code, no hash beyond its first 12 characters", () => {
    for (const [key, text] of Object.entries(golden)) {
      expect(text, key).not.toMatch(/undefined|null|NaN|afternoon|\[object/);
      expect(text, key).not.toContain("9f86d081884c7");
      expect(text.length, key).toBeLessThan(900);
    }
  });
});
