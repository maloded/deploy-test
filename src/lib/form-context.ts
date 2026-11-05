import type { FormSnapshot } from "./form-snapshot";
import { parseAmount } from "./offer-amount";
import { needsSlots } from "./request-types";

/**
 * The `form` object of the voice assistant's page_context answer, in the shape the reference site (multivan-landing, page-context.js) gives, so that an
 * agent prompt written for that site reads this one unchanged. Pure functions of the form snapshot; no DOM.
 *
 *   form: { phase, type, missing, consent, visible, submit, requestId?, values? }
 *
 * Privacy: `values` are in the answer ONLY in the phase "complete" (every required field valid and the consent ticked, or the request already sent). The reference
 * gives them as soon as the consent is ticked; this site is stricter, so while something else is still missing the agent has the field NAMES (`missing`) and no values.
 */

export const FORM_PHASES = ["not_opened", "open_filling", "closed_empty", "incomplete", "no_consent", "complete"] as const;
export type FormPhase = (typeof FORM_PHASES)[number];

/** `sending` while the request is in flight; `error` after a failed send; `sent` after a real success. */
export const SUBMIT_STATES = ["none", "sending", "sent", "error"] as const;
export type SubmitStatus = (typeof SUBMIT_STATES)[number];

/**
 * The names of the fields that block the form, as the agent knows them, in the reference's fixed order. `phone_or_email`: a viewing, a test drive or a question
 * with neither given (an offer names `email` and `phone` one by one). `slots`, `message` and `amount` are not asked for from the agent (source "agent").
 */
export const MISSING_KEYS = ["slots", "amount", "message", "name", "phone_or_email", "email", "phone", "consent"] as const;
export type MissingKey = (typeof MISSING_KEYS)[number];

/** What blocks the form, from the validation: the blocking field names of the lead schema and the code of the contact fields. */
export function missingKeysOf(blocking: ReadonlySet<string>, contact: { email?: string; phone?: string }): MissingKey[] {
  const keys = new Set<MissingKey>();
  if (blocking.has("preferredSlots")) keys.add("slots");
  if (blocking.has("amount")) keys.add("amount");
  if (blocking.has("message")) keys.add("message");
  if (blocking.has("name")) keys.add("name");
  if (contact.email === "phoneOrEmail" || contact.phone === "phoneOrEmail") keys.add("phone_or_email");
  else {
    if (blocking.has("email")) keys.add("email");
    if (blocking.has("phone")) keys.add("phone");
  }
  if (blocking.has("consent")) keys.add("consent");
  return MISSING_KEYS.filter((k) => keys.has(k));
}

/**
 * The phase of the form, in the order of the checks:
 *   complete      a sent request, or everything required is valid AND the consent is ticked;
 *   not_opened    the form was never opened;
 *   no_consent    everything required is valid and only the tick is missing, whether the dialog is open or closed;
 *   closed_empty  it was opened, nothing was entered and it is not on screen (the visitor left);
 *   open_filling  it is on screen and something required is still missing;
 *   incomplete    it is not on screen, something was entered and something required is still missing.
 */
export function formPhase({ everOpened, visible, hasValues, missing, sent }: { everOpened: boolean; visible: boolean; hasValues: boolean; missing: readonly MissingKey[]; sent: boolean }): FormPhase {
  if (sent) return "complete";
  if (!everOpened) return "not_opened";
  const rest = missing.filter((k) => k !== "consent");
  if (rest.length === 0) return missing.includes("consent") ? "no_consent" : "complete";
  if (!hasValues && !visible) return "closed_empty";
  return visible ? "open_filling" : "incomplete";
}

/** Something was entered, the tick and a window other than "anytime" included. */
export const hasValuesOf = (s: FormSnapshot): boolean =>
  Boolean(s.name || s.email || s.phone || s.preferredChannel || s.contactWindow !== "anytime" || s.message || s.amount || s.preferredSlots.length > 0 || s.consentGiven);

/** The values of a complete form, the reference's keys: slots only for a viewing or a test drive, the amount (a number, or null when it is not one) only for an offer. */
export function valuesOf(s: FormSnapshot): Record<string, unknown> {
  const values: Record<string, unknown> = { name: s.name, email: s.email, phone: s.phone, channel: s.preferredChannel, window: s.contactWindow, message: s.message };
  if (needsSlots(s.requestType)) values.slots = s.preferredSlots.map(({ date, time }) => ({ date, time }));
  if (s.requestType === "offer") {
    const amount = parseAmount(s.amount);
    values.amount = Number.isFinite(amount) ? amount : null;
  }
  return values;
}

/**
 * The `form` object. `includeValues` false (AGENT_INCLUDE_FORM, a switch for a platform that mishandles the keys) cuts the values and nothing else: the phase, the field
 * names and the states are not personal data.
 */
export function formContext(s: FormSnapshot, includeValues = true): Record<string, unknown> {
  const sent = s.status === "sent";
  const missing = sent ? [] : s.formMissing;
  const phase = formPhase({ everOpened: s.everOpened, visible: s.dialogOpen, hasValues: hasValuesOf(s), missing, sent });
  const out: Record<string, unknown> = { phase, type: s.requestType, missing: [...missing], consent: s.consentGiven, visible: s.dialogOpen, submit: s.status };
  if (sent && s.requestId) out.requestId = s.requestId;
  if (includeValues && phase === "complete") out.values = valuesOf(s);
  return out;
}

/**
 * Navigating to the contact form after a send: the agent leading to the same type again keeps the sent request (the answer stays "sent" with its number and values, so
 * Sofia does not ask for what was just sent); a link of the visitor, or the agent asking for another type, starts a new request.
 */
export function contactNavResets({ sent, sentType, type, agent }: { sent: boolean; sentType: string | null; type: string; agent: boolean }): boolean {
  if (!sent) return false;
  return !agent || type !== sentType;
}
