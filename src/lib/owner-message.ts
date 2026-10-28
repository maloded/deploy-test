import { ANYTIME, DEFAULT_CONTACT_WINDOWS, windowLabel, zoneCity, localStamp, type ContactWindow } from "./contact-windows";
import type { Language } from "./languages";
import { languageEntry } from "./languages";
import type { LeadRecord } from "./leads";
import { REQUEST_TYPES } from "./request-types";
import type { TelegramDetail } from "./telegram-config";

/**
 * The message the SELLER reads (a Telegram chat), as plain text. Its language is the seller's default language, not the
 * visitor's. The dictionary has an entry in every registry language; the registry completeness test checks it.
 */
export const OWNER_LABELS = {
  title: { en: "New request", de: "Neue Anfrage" },
  type: { en: "Type", de: "Art" },
  product: { en: "Product", de: "Produkt" },
  pageLanguage: { en: "Page language", de: "Seitensprache" },
  name: { en: "Name", de: "Name" },
  email: { en: "E-mail", de: "E-Mail" },
  phone: { en: "Phone", de: "Telefon" },
  channel: { en: "Preferred channel", de: "Bevorzugter Kanal" },
  contactWindow: { en: "Contact window", de: "Erreichbarkeit" },
  message: { en: "Message", de: "Nachricht" },
  slots: { en: "Preferred times (seller's local time)", de: "Wunschtermine (Ortszeit des Verkäufers)" },
  time: { en: "Received", de: "Eingegangen" },
  hint: { en: "Details: see your lead store.", de: "Einzelheiten: siehe Ihr Anfragenspeicher." },
  channelEmail: { en: "E-mail", de: "E-Mail" },
  channelPhone: { en: "Phone", de: "Telefon" },
  channelWhatsapp: { en: "WhatsApp", de: "WhatsApp" },
  channelTelegram: { en: "Telegram", de: "Telegram" },
} as const satisfies Record<string, Record<Language, string>>;

const CHANNEL_LABEL = { email: "channelEmail", phone: "channelPhone", whatsapp: "channelWhatsapp", telegram: "channelTelegram" } as const;

/** The longest message copied into the full notification. */
export const OWNER_MESSAGE_MAX = 500;

/** The request number: the short form of the lead id (its first eight characters), as the seller can find it in the store. */
export const requestNumber = (id: string): string => id.slice(0, 8).toUpperCase();

/** What the message needs besides the record: the language, the seller's windows (labels) and the product's title in the seller's language. */
export type OwnerContext = { lang: Language; windows?: readonly ContactWindow[]; productTitle?: string };

/** "2026-06-10 12:05 (Wien) \u00b7 10:05 UTC" with the zone stored in the record; "2026-06-10 10:05 UTC" without one. */
function receivedLine(record: LeadRecord, lang: Language): string {
  const utc = `${record.receivedAt.slice(0, 10)} ${record.receivedAt.slice(11, 16)} UTC`;
  if (!record.timezone) return utc;
  return `${localStamp(record.receivedAt, record.timezone)} (${zoneCity(record.timezone, lang)}) \u00b7 ${record.receivedAt.slice(11, 16)} UTC`;
}

/** The title of the product followed by its reference in brackets; just the reference when the title is unknown. */
const productLine = (record: LeadRecord, title: string | undefined): string => (title && title !== record.product ? `${title} (${record.product})` : record.product);

/** The label with its hours, never the raw code (an unknown code reads as the first window, "anytime"). */
function windowText(record: LeadRecord, owner: OwnerContext): string {
  const windows = owner.windows ?? DEFAULT_CONTACT_WINDOWS;
  const w = windows.find((x) => x.code === record.contactWindow) ?? windows.find((x) => x.code === ANYTIME) ?? windows[0];
  return windowLabel(w, owner.lang, owner.lang);
}

/**
 * "full": number, request type, product (title and reference), page language, name, e-mail, phone, channel, contact window (the
 * label with its hours), message (cut to 500 characters), preferred viewing times, time (in the seller's zone, then UTC). "short": number, request type, product, page language and time (the same product and time lines), and NOTHING
 * personal: no name, e-mail, phone, message or viewing time.
 */
export function ownerMessage(record: LeadRecord, detail: TelegramDetail, owner: OwnerContext | Language): string {
  const ctx: OwnerContext = typeof owner === "string" ? { lang: owner } : owner;
  const lang = ctx.lang;
  const l = (key: keyof typeof OWNER_LABELS) => OWNER_LABELS[key][lang];
  const lines = [
    `${l("title")} #${requestNumber(record.id)}`,
    `${l("type")}: ${REQUEST_TYPES[record.requestType].label[lang]}`,
    `${l("product")}: ${productLine(record, ctx.productTitle)}`,
    `${l("pageLanguage")}: ${languageEntry(record.lang).name}`,
  ];
  if (detail === "full") {
    lines.push(`${l("name")}: ${record.name}`, `${l("email")}: ${record.email}`);
    if (record.phone) lines.push(`${l("phone")}: ${record.phone}`);
    if (record.channel) lines.push(`${l("channel")}: ${l(CHANNEL_LABEL[record.channel as keyof typeof CHANNEL_LABEL] ?? "channelEmail")}`);
    lines.push(`${l("contactWindow")}: ${windowText(record, ctx)}`);
    if (record.message) lines.push(`${l("message")}: ${Array.from(record.message).slice(0, OWNER_MESSAGE_MAX).join("")}`);
    if (record.preferredSlots?.length) lines.push(`${l("slots")}:`, ...record.preferredSlots.map((s) => `- ${s.date} ${s.time}`));
  }
  lines.push(`${l("time")}: ${receivedLine(record, lang)}`);
  if (detail === "short") lines.push(l("hint"));
  return lines.join("\n");
}
