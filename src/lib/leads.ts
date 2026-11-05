import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ANYTIME, CODE_PATTERN } from "./contact-windows";
import { CHANNELS, type LeadInput } from "./lead";
import { ownerMessage, requestNumber, type OwnerContext } from "./owner-message";
import { NOTIFY_TIMEOUT_MS, sendTelegram, STORE_TIMEOUT_MS, TelegramError } from "./telegram";
import { notifyChoice, telegramSetup } from "./telegram-config";
import { sha256, type LeadContext } from "./lead-context";
import type { Language } from "./languages";
import { REQUEST_TYPE_IDS, type RequestType } from "./request-types";
import { isoWithOffset } from "./viewing";
import { languageSchema } from "./schema";

/**
 * The version of the stored record's shape. 1 was the record before this field existed (receivedAt, requestType test_drive, a combined product reference,
 * preferredSlots without an offset); 2 is the shape below, the contract for whatever reads the stored requests (docs/LEADS.md, "The lead record"). Bump it when a
 * field is renamed, removed or changes its meaning; adding an optional field does not need it.
 */
export const LEAD_SCHEMA_VERSION = 2 as const;

export type LeadStoreKind = "file" | "webhook" | "telegram";
const STORE_KINDS = ["file", "webhook", "telegram"] as const;

/** One preferred time: the seller-local date and time as the visitor chose them, and the same instant as ISO 8601 with its UTC offset. */
export type LeadSlot = { date: string; time: string; start: string };

/** How the request was delivered: `stored` is always true for a stored record; `notified` says whether the seller's chat was told (see markNotified). */
export type LeadDelivery = { stored: true; store: LeadStoreKind; notified: boolean };

/**
 * A stored lead. No IP address (a hash of the user agent only), no HTML, and the SHA-256 of the consent text that was shown, so a later change of the text can be told
 * apart. `source` says whether the visitor sent the form on their own ("form") or after the voice assistant led them to it ("agent").
 */
export type LeadRecord = {
  schemaVersion: typeof LEAD_SCHEMA_VERSION;
  /** The unique key of the record (a UUID; also in the file name). */
  id: string;
  /** What the visitor and the seller's message call the request: the first eight characters of `id`, upper case. */
  requestNumber: string;
  /** UTC, ISO 8601. */
  createdAt: string;
  /** The seller's id and the product's id (the two parts of the content reference "<seller>/<product>"). */
  seller: string;
  product: string;
  /** "viewing", "testdrive", "question" or "offer". */
  type: RequestType;
  source: "form" | "agent";
  /** The language of the page the visitor used. */
  lang: Language;
  name: string;
  /** At least one of `phone` and `email` is present (an offer has both): a reader must handle either missing. */
  phone?: string;
  email?: string;
  channel?: string;
  /** The code of the contact window ("anytime" when none was chosen). */
  contactWindow: string;
  /** The seller's time zone when the record was made (IANA); absent when the seller has none. */
  timezone?: string;
  /** Viewing and test drive requests: 1 to 3 preferred times (absent when the agent arranged them in the call). */
  slots?: LeadSlot[];
  /** An offer request: the amount offered, and the currency of the product's price (ISO 4217). The amount is absent when the agent took it in the call. */
  amount?: number;
  currency?: string;
  message?: string;
  consent: true;
  /** The seller's label of the consent text's version ("unversioned" when the seller gives none) and the SHA-256 of the text the visitor saw. */
  consentVersion: string;
  consentTextSha256: string;
  delivery: LeadDelivery;
  userAgentSha256: string;
};

/** The shape of a stored record (strict): a test checks the sample records in docs/LEADS.md and every record the store writes against it. */
export const leadRecordSchema = z
  .object({
    schemaVersion: z.literal(LEAD_SCHEMA_VERSION),
    id: z.string().regex(/^[0-9a-f-]{36}$/),
    requestNumber: z.string().regex(/^[0-9A-F]{8}$/),
    createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    seller: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    product: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    type: z.enum(REQUEST_TYPE_IDS),
    source: z.enum(["form", "agent"]),
    lang: languageSchema,
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.email().optional(),
    channel: z.enum(CHANNELS).optional(),
    contactWindow: z.string().regex(CODE_PATTERN),
    timezone: z.string().optional(),
    slots: z
      .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/) }).strict())
      .min(1)
      .max(3)
      .optional(),
    amount: z.number().positive().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    message: z.string().optional(),
    consent: z.literal(true),
    consentVersion: z.string().regex(/^[0-9a-z][0-9a-z-]{0,23}$/),
    consentTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
    delivery: z.object({ stored: z.literal(true), store: z.enum(STORE_KINDS), notified: z.boolean() }).strict(),
    userAgentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .refine((r) => r.phone !== undefined || r.email !== undefined, { message: "a record has a phone number or an e-mail address" });

/** The store kind LEADS_STORE names (checked by the handler before it gets here); "file" for anything else. */
export const storeKindOf = (env: Record<string, string | undefined>): LeadStoreKind => {
  const v = env.LEADS_STORE?.trim();
  return v === "webhook" || v === "telegram" ? v : "file";
};

/**
 * The record for a validated input. `now`, `id` and `store` are for tests and the handler. With Telegram as the store the message IS the delivery, so the record says
 * it was notified; for another store it says not yet, and markNotified changes it after the notifier has answered.
 */
export function buildRecord(input: LeadInput, context: LeadContext, userAgent: string | null, now: Date = new Date(), id: string = randomUUID(), store: LeadStoreKind = "file"): LeadRecord {
  const [seller, product] = context.product.split("/");
  const record: LeadRecord = {
    schemaVersion: LEAD_SCHEMA_VERSION,
    id,
    requestNumber: requestNumber(id),
    createdAt: now.toISOString(),
    seller,
    product,
    type: input.requestType,
    source: input.source ?? "form",
    lang: input.lang,
    name: input.name,
    contactWindow: input.contactWindow ?? ANYTIME,
    ...(context.timezone ? { timezone: context.timezone } : {}),
    consent: true,
    consentVersion: context.consentVersion ?? "unversioned",
    consentTextSha256: context.consent[input.lang],
    delivery: { stored: true, store, notified: store === "telegram" },
    userAgentSha256: sha256(userAgent ?? ""),
  };
  for (const key of ["phone", "email", "channel", "message"] as const) if (input[key] !== undefined) record[key] = input[key];
  const zone = context.viewing?.timezone ?? context.timezone;
  if (input.preferredSlots?.length) record.slots = input.preferredSlots.map(({ date, time }) => ({ date, time, start: (zone && isoWithOffset(date, time, zone)) || `${date}T${time}:00+00:00` }));
  if (input.requestType === "offer") {
    if (input.amount !== undefined) record.amount = Math.round(input.amount * 100) / 100;
    if (context.currency) record.currency = context.currency;
  }
  return record;
}

/** The store failed or none is configured. `reason` never holds personal data. */
export class LeadStoreError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

type Env = Record<string, string | undefined>;

/** 20261027T161500Z: sortable, and the age of a file can be read from its name without opening it. */
export const stamp = (iso: string): string => iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
export const FILE_NAME = /^(\d{8}T\d{6}Z)-[0-9a-f-]{36}\.json$/;

export const DEFAULT_LEADS_DIR = "data/leads";

async function storeFile(record: LeadRecord, env: Env, cwd: string): Promise<void> {
  const dir = path.resolve(cwd, env.LEADS_DIR?.trim() || DEFAULT_LEADS_DIR);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${stamp(record.createdAt)}-${record.id}.json`), JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (e) {
    throw new LeadStoreError(`file: ${(e as NodeJS.ErrnoException).code ?? "error"}`); // the code (EROFS, EACCES ...), never the path or the data
  }
}

async function storeWebhook(record: LeadRecord, env: Env, fetchImpl: typeof fetch): Promise<void> {
  let url: URL;
  try {
    url = new URL(env.LEADS_WEBHOOK_URL ?? "");
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
  } catch {
    throw new LeadStoreError("webhook: LEADS_WEBHOOK_URL is not a valid http(s) URL");
  }
  try {
    const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record), redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new LeadStoreError(`webhook: status ${res.status}`);
  } catch (e) {
    if (e instanceof LeadStoreError) throw e;
    throw new LeadStoreError(`webhook: ${(e as Error).name}`); // the error text may hold the URL, which is a secret
  }
}

async function storeTelegram(record: LeadRecord, env: Env, fetchImpl: typeof fetch, owner: OwnerContext): Promise<void> {
  const setup = telegramSetup(env, "store");
  if (!setup.ok) throw new LeadStoreError(`telegram: configuration error in ${setup.names.join(", ")}`); // names only
  try {
    await sendTelegram(setup.config, ownerMessage(record, setup.config.detail, owner), { fetchImpl, timeoutMs: STORE_TIMEOUT_MS });
  } catch (e) {
    throw new LeadStoreError(e instanceof TelegramError ? `telegram: ${e.reason}` : "telegram: error"); // the reason is a status class, never data
  }
}

/**
 * Stores a lead with the adapter LEADS_STORE names: "file" (JSON files under LEADS_DIR), "webhook" (POST to
 * LEADS_WEBHOOK_URL) or "telegram" (a message to the seller's chat; delivered only when Telegram answers ok:true). With none
 * configured, or when the store fails (a read-only file system, a webhook that is down, a bad Telegram configuration), it
 * throws LeadStoreError: the API then answers 503 and nothing claims to be saved. LEADS_NOTIFY alone is not a store.
 * `fetchImpl` and `cwd` are for tests; `owner` is the language of the message to the seller and what it needs (windows, product title).
 */
export async function storeLead(record: LeadRecord, env: Env = process.env, fetchImpl: typeof fetch = fetch, cwd: string = process.cwd(), owner: OwnerContext = { lang: "en" }): Promise<void> {
  const store = env.LEADS_STORE?.trim();
  if (store === "file") return storeFile(record, env, cwd);
  if (store === "webhook") return storeWebhook(record, env, fetchImpl);
  if (store === "telegram") return storeTelegram(record, env, fetchImpl, owner);
  throw new LeadStoreError(store ? `unknown LEADS_STORE "${store}"` : "LEADS_STORE is not set");
}

/**
 * Tells the seller's chat AFTER another store accepted the lead (LEADS_NOTIFY=telegram). It never throws and never changes
 * what the visitor is told: a failure is logged as one generic line (a status class or the NAMES of bad variables, never data)
 * and not retried beyond the adapter's single network retry. Resolves true when the chat was told, false when it was not (no notifier configured, or a failure).
 * With Telegram as the store itself LEADS_NOTIFY is a configuration error that the handler refuses before storing (see checkDelivery).
 */
export async function notifyLead(record: LeadRecord, env: Env = process.env, fetchImpl: typeof fetch = fetch, owner: OwnerContext = { lang: "en" }): Promise<boolean> {
  const choice = notifyChoice(env);
  if (choice === "none") return false;
  try {
    if (choice === "invalid") throw new LeadStoreError("configuration error in LEADS_NOTIFY");
    const setup = telegramSetup(env, "notifier");
    if (!setup.ok) throw new LeadStoreError(`configuration error in ${setup.names.join(", ")}`);
    await sendTelegram(setup.config, ownerMessage(record, setup.config.detail, owner), { fetchImpl, timeoutMs: NOTIFY_TIMEOUT_MS });
    return true;
  } catch (e) {
    const reason = e instanceof TelegramError || e instanceof LeadStoreError ? e.reason : "error";
    console.error(`lead notification not sent (${reason})`);
    return false;
  }
}

/**
 * After the notifier told the chat: a file store's record says so (`delivery.notified` true), by writing the file again. Best effort, like the notification: a failure is
 * one generic line and changes nothing for the visitor. A webhook receiver got the record before the notification and keeps `notified: false`; Telegram as the store says
 * true from the start. Resolves true when the file was updated.
 */
export async function markNotified(record: LeadRecord, env: Env = process.env, cwd: string = process.cwd()): Promise<boolean> {
  if (storeKindOf(env) !== "file" || env.LEADS_STORE?.trim() !== "file") return false;
  const dir = path.resolve(cwd, env.LEADS_DIR?.trim() || DEFAULT_LEADS_DIR);
  try {
    const updated: LeadRecord = { ...record, delivery: { ...record.delivery, notified: true } };
    await fs.writeFile(path.join(dir, `${stamp(record.createdAt)}-${record.id}.json`), JSON.stringify(updated, null, 2) + "\n", { flag: "w", mode: 0o600 });
    return true;
  } catch (e) {
    console.error(`lead record not updated (file: ${(e as NodeJS.ErrnoException).code ?? "error"})`);
    return false;
  }
}

/** The delivery settings that must be right before a lead is accepted (so a wrong setup loses nothing): Telegram as store and as notifier at once. */
export function checkDelivery(env: Env): LeadStoreError | null {
  if (env.LEADS_STORE?.trim() === "telegram" && env.LEADS_NOTIFY?.trim() === "telegram") return new LeadStoreError("telegram: configuration error in LEADS_STORE, LEADS_NOTIFY");
  return null;
}
