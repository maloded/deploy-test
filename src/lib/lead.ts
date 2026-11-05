import { z } from "zod";
import { CODE_PATTERN } from "./contact-windows";
import { parseAmount } from "./offer-amount";
import { canonicalRequestType, needsSlots, REQUEST_TYPE_IDS } from "./request-types";
import { MAX_SLOTS } from "./viewing";
import { languageSchema } from "./schema";

/**
 * The contact form's data model, shared by the browser (inline validation) and the server (POST /api/lead): one place
 * for the field names, the limits, the normalisation and the zod schema. Nothing here touches the DOM or the file system.
 */
export const CHANNELS = ["email", "phone", "whatsapp", "telegram"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Where a request came from: "form" (the visitor on the page) or "agent" (the voice assistant led them to the form during a call). It is a label the page sets;
 * the only thing it changes is that the preferred times, the question and the amount are optional, because Sofia arranges them in the conversation.
 * Name, contact and consent stay required whatever it says.
 */
export const SOURCES = ["form", "agent"] as const;
export type Source = (typeof SOURCES)[number];

export const LIMITS = { name: 100, email: 254, phone: 40, message: 1000, honeypot: 200 } as const;

/** A post that arrives sooner than this after the visitor's first keystroke is not a person (the server answers 422). */
export const MIN_FILL_MS = 3000;
/** The largest believable fill time (a day); anything else is malformed. */
const MAX_FILL_MS = 86_400_000;

/** The visible form fields, in page order. */
export const FIELDS = ["requestType", "preferredSlots", "amount", "name", "email", "phone", "channel", "contactWindow", "message", "consent"] as const;
export type LeadField = (typeof FIELDS)[number];

/** Control characters, zero-width and line-separator characters (written as escapes, so the source stays readable). */
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]", "g");

const PHONE = /^[+0-9 ()./-]{5,40}$/;

/** Plain text only: tags and control characters removed, NFC, trimmed. A single-line field also has its whitespace collapsed. */
export function cleanText(value: string, multiline = false): string {
  const text = value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(CONTROL, "");
  return (multiline ? text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : text.replace(/\s+/g, " ")).trim();
}

const text = (max: number) => z.string().min(1).max(max);

export const leadSchema = z
  .object({
    lang: languageSchema,
    /** What the visitor wants (see request-types.ts); the server also checks that the product type offers it. */
    requestType: z.enum(REQUEST_TYPE_IDS),
    /** Seller-local preferred times of a viewing or test drive request, 1 to 3 (their dates are checked by the server against the viewing settings). */
    preferredSlots: z.array(z.object({ date: z.string().max(10), time: z.string().max(5) }).strict()).max(MAX_SLOTS).optional(),
    /** The offered amount in the product's currency (an offer request; the range is the product's, checked by the server and the form). A string such as "50.000" or "49500,5" is read like the reference site does (offer-amount.ts). */
    amount: z.number().positive().max(1e12).optional(),
    /** See SOURCES; absent means "form". */
    source: z.enum(SOURCES).optional(),
    name: text(LIMITS.name),
    /** At least one of phone and e-mail (an offer needs both): checked with the other rules, see ruleErrors. What is given is always checked. */
    email: z.email().max(LIMITS.email).optional(),
    phone: z.string().regex(PHONE).optional(),
    channel: z.enum(CHANNELS).optional(),
    /** A contact window code; the server checks it against the seller's windows (the lead context). */
    contactWindow: z.string().regex(CODE_PATTERN).optional(),
    message: text(LIMITS.message).optional(),
    consent: z.literal(true),
    /** The honeypot: a real visitor never sees it, so it is empty. */
    website: z.string().max(LIMITS.honeypot).optional(),
    /** Milliseconds between the visitor's first keystroke and the submit. */
    elapsedMs: z.number().int().min(0).max(MAX_FILL_MS),
  })
  .strict();
export type LeadInput = z.infer<typeof leadSchema>;

/** Cleans the strings of a raw body or form state; an empty optional field is left out. Unknown keys are kept (the schema rejects them). */
export function normalizeLead(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") out[key] = value;
    else if (key === "lang" || key === "channel" || key === "website" || key === "source") out[key] = key === "website" ? value : value.trim();
    else if (key === "requestType") out[key] = canonicalRequestType(value.trim()) ?? value.trim(); // "test_drive" is the same thing as "testdrive"
    else if (key === "amount") out[key] = value.trim() === "" ? "" : Number.isFinite(parseAmount(value)) ? parseAmount(value) : value; // "50.000", "49500,5"
    else out[key] = cleanText(value, key === "message");
  }
  for (const key of ["email", "phone", "channel", "message", "website", "amount", "source"]) if (out[key] === "") delete out[key];
  return out;
}

export type FieldErrorCode = "required" | "email" | "phone" | "phoneOrEmail" | "amount" | "max" | "consent" | "invalid";
export type LeadErrors = Partial<Record<LeadField | "form", FieldErrorCode>>;

/**
 * The rules that depend on the request type and the source, on a normalized body: every blocking field at once, as a code each.
 *  - contact: a viewing, a test drive and a question need a phone number OR an e-mail address (both fields say "phoneOrEmail"); an offer needs both;
 *  - the question of a "question" request is required, except from the agent; the preferred times of a viewing or test drive too; the amount of an offer too;
 *  - slots belong to the types that need them and the amount to the offer: anywhere else they are refused.
 * Whether what is given is well formed is the schema's business, not this function's.
 */
export function ruleErrors(body: Record<string, unknown>): LeadErrors {
  const errors: LeadErrors = {};
  const type = canonicalRequestType(body.requestType);
  if (type === null) return errors;
  const agent = body.source === "agent";
  const given = (key: string) => body[key] !== undefined && body[key] !== "";
  if (type === "offer") {
    if (!given("email")) errors.email = "required";
    if (!given("phone")) errors.phone = "required";
  } else if (!given("email") && !given("phone")) {
    errors.email = "phoneOrEmail";
    errors.phone = "phoneOrEmail";
  }
  if (type === "question" && !given("message") && !agent) errors.message = "required";
  const slots = Array.isArray(body.preferredSlots) ? body.preferredSlots.length : 0;
  if (needsSlots(type) && slots === 0 && !agent) errors.preferredSlots = "required";
  if (!needsSlots(type) && slots > 0) errors.preferredSlots = "invalid";
  if (type === "offer" && !given("amount") && !agent) errors.amount = "required";
  if (type !== "offer" && given("amount")) errors.amount = "invalid";
  return errors;
}

/** Validates a raw body: the clean data, or one error code per field (never the values). */
export function validateLead(raw: unknown): { ok: true; data: LeadInput } | { ok: false; errors: LeadErrors } {
  const normalized = normalizeLead(raw) as Record<string, unknown>;
  const parsed = leadSchema.safeParse(normalized);
  const errors: LeadErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      const field = (FIELDS as readonly string[]).includes(key) ? (key as LeadField) : "form";
      if (errors[field]) continue;
      const given = normalized?.[field];
      let code: FieldErrorCode = "invalid";
      if (field === "consent") code = "consent";
      else if (field === "amount") code = "amount";
      else if (field !== "form") {
        if (field === "name" && (given === undefined || given === "")) code = "required";
        else if (issue.code === "too_big") code = "max";
        else if (issue.code === "invalid_format" && field === "email") code = "email";
        else if (issue.code === "invalid_format" && field === "phone") code = "phone";
        else if (issue.code === "too_small") code = "required";
        else if (field === "email") code = "email";
      }
      errors[field] = code;
    }
  }
  // the rules of the request type are checked even when a field failed, so one answer lists every blocking field
  if (typeof normalized === "object" && normalized !== null) for (const [field, code] of Object.entries(ruleErrors(normalized))) if (!errors[field as LeadField]) errors[field as LeadField] = code;
  if (parsed.success && Object.keys(errors).length === 0) return { ok: true, data: parsed.data };
  return { ok: false, errors };
}
