import { ANYTIME, DEFAULT_CONTACT_WINDOWS, windowLabel, zoneCity, localStamp, type ContactWindow } from "./contact-windows";
import type { Language } from "./languages";
import { languageEntry, localeOf } from "./languages";
import type { LeadRecord } from "./leads";
import { differenceText, moneyText } from "./offer-amount";
import { needsSlots, REQUEST_TYPES } from "./request-types";
import type { TelegramDetail } from "./telegram-config";

/**
 * The message the SELLER reads (a Telegram chat), as plain text. Its language is the seller's default language, not the
 * visitor's. The dictionary has an entry in every registry language; the registry completeness test checks it.
 *
 * Its content follows the reference site's message (multivan-landing, server/worker.js): a header, the contact block (name, e-mail and phone always, "–" for what
 * the visitor did not give), the preferred times or the note that the agent arranged the time, the offer with the asking price and the difference, the question
 * or the note, the consent (version label and the first characters of its hash) and the time. The turkish and bulgarian texts are AI drafts, like the page's.
 */
export const OWNER_LABELS = {
  title: { en: "New request", de: "Neue Anfrage", tr: "Yeni talep", bg: "Ново запитване" },
  type: { en: "Type", de: "Art", tr: "Tür", bg: "Вид" },
  product: { en: "Product", de: "Produkt", tr: "Ürün", bg: "Продукт" },
  pageLanguage: { en: "Page language", de: "Seitensprache", tr: "Sayfa dili", bg: "Език на страницата" },
  name: { en: "Name", de: "Name", tr: "Ad Soyad", bg: "Име" },
  email: { en: "E-mail", de: "E-Mail", tr: "E-posta", bg: "Имейл" },
  phone: { en: "Phone", de: "Telefon", tr: "Telefon", bg: "Телефон" },
  channel: { en: "Preferred channel", de: "Bevorzugter Kanal", tr: "Tercih ettiğiniz iletişim kanalı", bg: "Предпочитан канал за връзка" },
  channelNone: { en: "No preference", de: "Keine Präferenz", tr: "Fark etmez", bg: "Без предпочитание" },
  contactWindow: { en: "Contact window", de: "Erreichbarkeit", tr: "Ulaşılabilirlik", bg: "Достъпност за връзка" },
  message: { en: "Message", de: "Nachricht", tr: "Mesaj", bg: "Съобщение" },
  question: { en: "Question", de: "Frage", tr: "Soru", bg: "Въпрос" },
  source: { en: "Source", de: "Quelle", tr: "Kaynak", bg: "Източник" },
  sourceForm: { en: "Form (website)", de: "Formular (Website)", tr: "Form (web sitesi)", bg: "Формуляр (уебсайт)" },
  slots: { en: "Preferred times (seller's local time)", de: "Wunschtermine (Ortszeit des Verkäufers)", tr: "Tercih edilen zamanlar (satıcının yerel saati)", bg: "Предпочитани часове (местно време на продавача)" },
  offer: { en: "Offer", de: "Angebot", tr: "Teklif", bg: "Оферта" },
  askingPrice: { en: "Price", de: "Preis", tr: "Fiyat", bg: "Цена" },
  /** The type of an offer request as the seller reads it: not the tab's label ("Make an offer"), which is the visitor's button. */
  typeOffer: { en: "Price offer", de: "Preisangebot", tr: "Fiyat teklifi", bg: "Ценово предложение" },
  difference: { en: "Difference", de: "Differenz", tr: "Fark", bg: "Разлика" },
  consent: { en: "Consent", de: "Einwilligung", tr: "Onay", bg: "Съгласие" },
  consentVersion: { en: "version", de: "Version", tr: "sürüm", bg: "версия" },
  time: { en: "Received", de: "Eingegangen", tr: "Alındı", bg: "Получено" },
  hint: { en: "Details: see your lead store.", de: "Einzelheiten: siehe Ihr Anfragenspeicher.", tr: "Ayrıntılar: talep kayıt deponuza bakın.", bg: "Подробности: вижте хранилището на запитванията." },
  channelEmail: { en: "E-mail", de: "E-Mail", tr: "E-posta", bg: "Имейл" },
  channelPhone: { en: "Phone", de: "Telefon", tr: "Telefon", bg: "Телефон" },
  channelWhatsapp: { en: "WhatsApp", de: "WhatsApp", tr: "WhatsApp", bg: "WhatsApp" },
  channelTelegram: { en: "Telegram", de: "Telegram", tr: "Telegram", bg: "Telegram" },
} as const satisfies Record<string, Record<Language, string>>;

/**
 * The sentences that name the voice agent: its name (seller.json, agent.avatar.name) where the seller has given one, else a plain word for it.
 * `{agent}` is the name. Separate from OWNER_LABELS because they are templates, not labels.
 */
const AGENT_TEXT = {
  sourceAgent: { en: "{agent} (voice agent)", de: "{agent} (Agent)", tr: "{agent} (sesli asistan)", bg: "{agent} (гласов агент)" },
  slotsInCall: {
    en: "Appointment: arranged with {agent} in the call – see the calendar",
    de: "Termin: im Gespräch mit {agent} vereinbart – siehe Kalender",
    tr: "Randevu: görüşmede {agent} ile kararlaştırıldı – takvime bakın",
    bg: "Час: уговорен с {agent} в разговора – вижте календара",
  },
  slotsFallback: {
    en: "Alternative times (the agreed time: see the calendar)",
    de: "Ausweichtermine (vereinbarter Termin: siehe Kalender)",
    tr: "Alternatif zamanlar (kararlaştırılan zaman: takvime bakın)",
    bg: "Резервни часове (уговореният час: вижте календара)",
  },
  amountInCall: { en: "Amount: with {agent} in the call", de: "Betrag: im Gespräch mit {agent}", tr: "Tutar: görüşmede {agent} ile", bg: "Сума: с {agent} в разговора" },
} as const satisfies Record<string, Record<Language, string>>;

/** What stands for the agent where the seller gave it no name. */
const AGENT_WORD: Record<Language, string> = { en: "the voice agent", de: "dem Sprachagenten", tr: "sesli asistan", bg: "гласовия агент" };
const AGENT_NOUN: Record<Language, string> = { en: "Voice agent", de: "Sprachagent", tr: "Sesli asistan", bg: "Гласов агент" };

const CHANNEL_LABEL = { email: "channelEmail", phone: "channelPhone", whatsapp: "channelWhatsapp", telegram: "channelTelegram" } as const;

/** The longest message copied into the full notification. */
export const OWNER_MESSAGE_MAX = 500;

/** The sign of an empty field in the contact block, as on the reference site. */
const EMPTY = "–";

/** The request number: the short form of the lead id (its first eight characters), as the seller can find it in the store. */
export const requestNumber = (id: string): string => id.slice(0, 8).toUpperCase();

/**
 * What the message needs besides the record: the language, the seller's windows (labels), the product's title in the seller's language, the product's asking price
 * (for an offer: the price and the difference; none for a price that is per month and so on) and the name of the seller's voice agent.
 */
export type OwnerContext = { lang: Language; windows?: readonly ContactWindow[]; productTitle?: string; price?: number; agentName?: string };

/** "2026-06-10 12:05 (Wien) · 10:05 UTC" with the zone stored in the record; "2026-06-10 10:05 UTC" without one. */
function receivedLine(record: LeadRecord, lang: Language): string {
  const utc = `${record.createdAt.slice(0, 10)} ${record.createdAt.slice(11, 16)} UTC`;
  if (!record.timezone) return utc;
  return `${localStamp(record.createdAt, record.timezone)} (${zoneCity(record.timezone, lang)}) · ${record.createdAt.slice(11, 16)} UTC`;
}

/** The title of the product followed by its reference in brackets; just the reference when the title is unknown. */
const productLine = (record: LeadRecord, title: string | undefined): string => {
  const reference = `${record.seller}/${record.product}`;
  return title && title !== reference ? `${title} (${reference})` : reference;
};

/** An amount in the product's currency, in the seller's language ("53.900 €", "€53,900"). */
const money = (amount: number, currency: string | undefined, lang: Language): string => moneyText(amount, currency, localeOf(lang));

/** The difference of an offer to the asking price in the seller's language ("−3.900 € (−7,2 %)"; the form shows the same to the visitor). */
const differenceOf = (amount: number, price: number, currency: string | undefined, lang: Language): string => differenceText(amount, price, currency, localeOf(lang));

/** The label with its hours, never the raw code (an unknown code reads as the first window, "anytime"). */
function windowText(record: LeadRecord, owner: OwnerContext): string {
  const windows = owner.windows ?? DEFAULT_CONTACT_WINDOWS;
  const w = windows.find((x) => x.code === record.contactWindow) ?? windows.find((x) => x.code === ANYTIME) ?? windows[0];
  return windowLabel(w, owner.lang, owner.lang);
}

/** "1. Do., 11.06.2026, 10:00": the day in the seller's language (the date is the seller's calendar day), then the time. */
function slotLine(slot: { date: string; time: string }, index: number, lang: Language): string {
  const day = new Intl.DateTimeFormat(localeOf(lang), { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${slot.date}T12:00:00Z`));
  return `${index + 1}. ${day}, ${slot.time}`;
}

/**
 * "full": the header (number, request type, source, product with its reference, page language), the contact block, the preferred times or the note that the agent
 * arranged them, the offer, the question or the note (cut to 500 characters), the consent and the time (in the seller's zone, then UTC), as blocks with a blank line
 * between them. "short": number, request type, source, product, page language and time (the same words) and the hint: nothing personal (no name, e-mail, phone,
 * message, time slot or amount, and no consent).
 */
export function ownerMessage(record: LeadRecord, detail: TelegramDetail, owner: OwnerContext | Language): string {
  const ctx: OwnerContext = typeof owner === "string" ? { lang: owner } : owner;
  const lang = ctx.lang;
  const l = (key: keyof typeof OWNER_LABELS) => OWNER_LABELS[key][lang];
  const agent = (key: keyof typeof AGENT_TEXT, fallback?: string) => AGENT_TEXT[key][lang].replace("{agent}", ctx.agentName ?? fallback ?? AGENT_WORD[lang]);
  const fromAgent = record.source === "agent";
  const header = [
    `${l("title")} #${requestNumber(record.id)}`,
    `${l("type")}: ${record.type === "offer" ? l("typeOffer") : REQUEST_TYPES[record.type].label[lang]}`,
    `${l("source")}: ${fromAgent ? (ctx.agentName ? agent("sourceAgent") : `${AGENT_NOUN[lang]}`) : l("sourceForm")}`,
    `${l("product")}: ${productLine(record, ctx.productTitle)}`,
    `${l("pageLanguage")}: ${languageEntry(record.lang).name}`,
  ];
  if (detail === "short") return [...header, "", `${l("time")}: ${receivedLine(record, lang)}`, l("hint")].join("\n");

  const blocks: string[][] = [header];
  blocks.push([
    `${l("name")}: ${record.name}`,
    `${l("email")}: ${record.email ?? EMPTY}`,
    `${l("phone")}: ${record.phone ?? EMPTY}`,
    `${l("channel")}: ${record.channel ? l(CHANNEL_LABEL[record.channel as keyof typeof CHANNEL_LABEL] ?? "channelEmail") : l("channelNone")}`,
    `${l("contactWindow")}: ${windowText(record, ctx)}`,
  ]);
  // a viewing or a test drive: the times the visitor named; from the agent, with none, the note that the agent arranged it, with some, the fall-back times
  if (needsSlots(record.type)) {
    if (record.slots?.length) blocks.push([fromAgent ? agent("slotsFallback") + ":" : `${l("slots")}:`, ...record.slots.map((s, i) => slotLine(s, i, lang))]);
    else if (fromAgent) blocks.push([agent("slotsInCall")]);
  }
  if (record.type === "offer") {
    const price = ctx.price !== undefined && ctx.price > 0 ? ctx.price : undefined;
    const lines = record.amount !== undefined ? [`${l("offer")}: ${money(record.amount, record.currency, lang)}`] : [agent("amountInCall")];
    if (price !== undefined) lines.push(`${l("askingPrice")}: ${money(price, record.currency, lang)}`);
    if (price !== undefined && record.amount !== undefined) lines.push(`${l("difference")}: ${differenceOf(record.amount, price, record.currency, lang)}`);
    blocks.push(lines);
  }
  if (record.message) blocks.push([`${record.type === "question" ? l("question") : l("message")}:`, Array.from(record.message).slice(0, OWNER_MESSAGE_MAX).join("")]);
  blocks.push([`${l("consent")}: ${l("consentVersion")} ${record.consentVersion} · SHA-256 ${record.consentTextSha256.slice(0, 12)}`, `${l("time")}: ${receivedLine(record, lang)}`]);
  return blocks.map((b) => b.join("\n")).join("\n\n");
}
