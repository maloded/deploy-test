import { z } from "zod";
import { needsSlots, REQUEST_TYPE_IDS } from "./request-types";
import { MAX_SLOTS } from "./viewing";
import { languageSchema } from "./schema";

/**
 * The contact form's data model, shared by the browser (inline validation) and the server (POST /api/lead): one place
 * for the field names, the limits, the normalisation and the zod schema. Nothing here touches the DOM or the file system.
 */
export const CHANNELS = ["email", "phone", "whatsapp", "telegram"] as const;
export type Channel = (typeof CHANNELS)[number];

export const LIMITS = { name: 100, email: 254, phone: 40, bestTime: 100, message: 1000, honeypot: 200 } as const;

/** A post that arrives sooner than this after the visitor's first keystroke is not a person (the server answers 422). */
export const MIN_FILL_MS = 3000;
/** The largest believable fill time (a day); anything else is malformed. */
const MAX_FILL_MS = 86_400_000;

/** The visible form fields, in page order. */
export const FIELDS = ["requestType", "preferredSlots", "name", "email", "phone", "channel", "bestTime", "message", "consent"] as const;
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
    name: text(LIMITS.name),
    email: z.email().max(LIMITS.email),
    phone: z.string().regex(PHONE).optional(),
    channel: z.enum(CHANNELS).optional(),
    bestTime: text(LIMITS.bestTime).optional(),
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
    else if (key === "lang" || key === "channel" || key === "website") out[key] = key === "website" ? value : value.trim();
    else out[key] = cleanText(value, key === "message");
  }
  for (const key of ["phone", "channel", "bestTime", "message", "website"]) if (out[key] === "") delete out[key];
  return out;
}

export type FieldErrorCode = "required" | "email" | "phone" | "max" | "consent" | "invalid";
export type LeadErrors = Partial<Record<LeadField | "form", FieldErrorCode>>;

/** Validates a raw body: the clean data, or one error code per field (never the values). */
export function validateLead(raw: unknown): { ok: true; data: LeadInput } | { ok: false; errors: LeadErrors } {
  const normalized = normalizeLead(raw) as Record<string, unknown>;
  const parsed = leadSchema.safeParse(normalized);
  if (parsed.success) {
    // slots belong to the types that need them: at least one there, none anywhere else
    const slots = parsed.data.preferredSlots?.length ?? 0;
    if (needsSlots(parsed.data.requestType) && slots === 0) return { ok: false, errors: { preferredSlots: "required" } };
    if (!needsSlots(parsed.data.requestType) && slots > 0) return { ok: false, errors: { preferredSlots: "invalid" } };
    return { ok: true, data: parsed.data };
  }
  const errors: LeadErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    const field = (FIELDS as readonly string[]).includes(key) ? (key as LeadField) : "form";
    if (errors[field]) continue;
    const given = normalized?.[field];
    let code: FieldErrorCode = "invalid";
    if (field === "consent") code = "consent";
    else if (field !== "form") {
      if ((field === "name" || field === "email") && (given === undefined || given === "")) code = "required";
      else if (issue.code === "too_big") code = "max";
      else if (issue.code === "invalid_format" && field === "email") code = "email";
      else if (issue.code === "invalid_format" && field === "phone") code = "phone";
      else if (issue.code === "too_small") code = "required";
      else if (field === "email") code = "email";
    }
    errors[field] = code;
  }
  return { ok: false, errors };
}
