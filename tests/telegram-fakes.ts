import type { LeadRecord } from "@/lib/leads";

// Obviously fake values with the right shape; no real token or chat id appears anywhere in the repository.
export const FAKE_TOKEN = "123456:FAKE-TOKEN-NOT-REAL-0000000000000000";
export const FAKE_CHAT = "-1000000000000";

/** A FAKE record: nothing here belongs to a person. */
export const FAKE_RECORD: LeadRecord = {
  schemaVersion: 2,
  id: "0a1b2c3d-0000-4000-8000-000000000000",
  requestNumber: "0A1B2C3D",
  createdAt: "2026-06-10T10:05:00.000Z",
  seller: "example-seller",
  product: "example-house",
  type: "viewing",
  source: "form",
  lang: "de",
  name: "Jane Example",
  phone: "+00 000 000 000",
  email: "jane@example.invalid",
  channel: "phone",
  contactWindow: "morning",
  timezone: "Europe/Vienna",
  slots: [
    { date: "2026-06-11", time: "10:00", start: "2026-06-11T10:00:00+02:00" },
    { date: "2026-06-13", time: "15:00", start: "2026-06-13T15:00:00+02:00" },
  ],
  message: "Is the second floor accessible?",
  consent: true,
  consentVersion: "2026-06-01",
  consentTextSha256: "0".repeat(64),
  delivery: { stored: true, store: "file", notified: true },
  userAgentSha256: "1".repeat(64),
};

/** What the message needs besides the record, as the lead context provides it: the language and the product title in that language. */
export const FAKE_OWNER = (lang: "de" | "en") => ({ lang, productTitle: lang === "de" ? "Beispielhaus" : "Example house" });
