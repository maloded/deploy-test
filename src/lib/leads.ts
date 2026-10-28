import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ANYTIME, CODE_PATTERN } from "./contact-windows";
import { CHANNELS, type LeadInput } from "./lead";
import { ownerMessage, type OwnerContext } from "./owner-message";
import { NOTIFY_TIMEOUT_MS, sendTelegram, STORE_TIMEOUT_MS, TelegramError } from "./telegram";
import { notifyChoice, telegramSetup } from "./telegram-config";
import { sha256, type LeadContext } from "./lead-context";
import type { Language } from "./languages";
import { REQUEST_TYPE_IDS, type RequestType } from "./request-types";
import { languageSchema } from "./schema";

/**
 * A stored lead. No IP address (a hash of the user agent only), no HTML, and the SHA-256 of the consent text that was
 * shown, so a later change of the text can be told apart. `source` is always "form": nothing is submitted by an agent.
 */
export type LeadRecord = {
  id: string;
  /** UTC, ISO 8601. */
  receivedAt: string;
  /** "<seller>/<product>" */
  product: string;
  lang: Language;
  /** "viewing", "test_drive", "question" or "offer". */
  requestType: RequestType;
  name: string;
  email: string;
  phone?: string;
  channel?: string;
  /** The code of the contact window ("anytime" when none was chosen). */
  contactWindow: string;
  /** The seller's time zone when the record was made (IANA); absent when the seller has none. */
  timezone?: string;
  message?: string;
  /** Viewing and test drive requests: 1 to 3 preferred times, seller-local (the seller's time zone is in the viewing settings). */
  preferredSlots?: { date: string; time: string }[];
  consent: true;
  consentTextSha256: string;
  source: "form";
  userAgentSha256: string;
};

/** The shape of a stored record (strict): a test checks the sample record in PROJECT.md and every record the store writes against it. */
export const leadRecordSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f-]{36}$/),
    receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    product: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/),
    lang: languageSchema,
    requestType: z.enum(REQUEST_TYPE_IDS),
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().optional(),
    channel: z.enum(CHANNELS).optional(),
    contactWindow: z.string().regex(CODE_PATTERN),
    timezone: z.string().optional(),
    message: z.string().optional(),
    preferredSlots: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).strict()).min(1).max(3).optional(),
    consent: z.literal(true),
    consentTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
    source: z.literal("form"),
    userAgentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** The record for a validated input. `now` and `id` are for tests. */
export function buildRecord(input: LeadInput, context: LeadContext, userAgent: string | null, now: Date = new Date(), id: string = randomUUID()): LeadRecord {
  const record: LeadRecord = {
    id,
    receivedAt: now.toISOString(),
    product: context.product,
    lang: input.lang,
    requestType: input.requestType,
    name: input.name,
    email: input.email,
    contactWindow: input.contactWindow ?? ANYTIME,
    ...(context.timezone ? { timezone: context.timezone } : {}),
    consent: true,
    consentTextSha256: context.consent[input.lang],
    source: "form",
    userAgentSha256: sha256(userAgent ?? ""),
  };
  for (const key of ["phone", "channel", "message"] as const) if (input[key] !== undefined) record[key] = input[key];
  if (input.preferredSlots?.length) record.preferredSlots = input.preferredSlots.map(({ date, time }) => ({ date, time }));
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
    await fs.writeFile(path.join(dir, `${stamp(record.receivedAt)}-${record.id}.json`), JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
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
 * and not retried beyond the adapter's single network retry. With Telegram as the store itself LEADS_NOTIFY is a
 * configuration error that the handler refuses before storing (see checkDelivery).
 */
export async function notifyLead(record: LeadRecord, env: Env = process.env, fetchImpl: typeof fetch = fetch, owner: OwnerContext = { lang: "en" }): Promise<void> {
  const choice = notifyChoice(env);
  if (choice === "none") return;
  try {
    if (choice === "invalid") throw new LeadStoreError("configuration error in LEADS_NOTIFY");
    const setup = telegramSetup(env, "notifier");
    if (!setup.ok) throw new LeadStoreError(`configuration error in ${setup.names.join(", ")}`);
    await sendTelegram(setup.config, ownerMessage(record, setup.config.detail, owner), { fetchImpl, timeoutMs: NOTIFY_TIMEOUT_MS });
  } catch (e) {
    const reason = e instanceof TelegramError || e instanceof LeadStoreError ? e.reason : "error";
    console.error(`lead notification not sent (${reason})`);
  }
}

/** The delivery settings that must be right before a lead is accepted (so a wrong setup loses nothing): Telegram as store and as notifier at once. */
export function checkDelivery(env: Env): LeadStoreError | null {
  if (env.LEADS_STORE?.trim() === "telegram" && env.LEADS_NOTIFY?.trim() === "telegram") return new LeadStoreError("telegram: configuration error in LEADS_STORE, LEADS_NOTIFY");
  return null;
}
