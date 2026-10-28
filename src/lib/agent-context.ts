import type { FormSnapshot } from "./form-snapshot";

/**
 * The answer to the voice assistant's page_context question. Read-only: it describes the page, it is never a way to write
 * a field. The values the visitor typed are in it ONLY in the phase "complete" (valid and consented); in every other phase
 * the answer has no values at all. Two keys carry no value and are in every phase: `submit` (none, sent, failed: whether
 * the request really reached the seller) and `missing` (the NAMES of the fields that block completion, never a value or
 * the content of a field; empty in the phase complete). Never in it: the consent text, the honeypot, the timers.
 */

/**
 * For the case where the platform ignores keys it does not know: false cuts only the "form" key. Language, dialogOpen, the
 * phase, submit and missing stay (they are not personal data: states and field names only).
 */
export const AGENT_INCLUDE_FORM = true;

export const PHASES = ["not_opened", "open_filling", "closed_empty", "no_consent", "incomplete", "complete"] as const;
export type Phase = (typeof PHASES)[number];

const hasValues = (s: FormSnapshot): boolean => Boolean(s.name || s.email || s.phone || s.preferredChannel || s.contactWindow !== "anytime" || s.message || s.preferredSlots.length > 0);

/**
 * Where the visitor is with the form:
 *  - complete: the required fields are valid and the consent is given, whether the dialog is open or closed;
 *  - not_opened: the dialog was never opened;
 *  - open_filling: the dialog is open and the form is not complete;
 *  - closed_empty: it was opened and closed and every field is empty;
 *  - no_consent: it is closed, there are values, and the consent box is not ticked;
 *  - incomplete: it is closed, something is filled in (the consent box counts), the consent is ticked and the form is still not
 *    complete (for example a required field is missing or invalid).
 * Only complete carries values.
 */
export function phaseOf(s: FormSnapshot): Phase {
  if (s.valid && s.consentGiven) return "complete";
  if (!s.everOpened) return "not_opened";
  if (s.dialogOpen) return "open_filling";
  if (!hasValues(s) && !s.consentGiven) return "closed_empty";
  return s.consentGiven ? "incomplete" : "no_consent";
}

export type PageContextInput = { language: string; product: string; path: string; title: string; snapshot: FormSnapshot };

export function buildPageContext({ language, product, path, title, snapshot }: PageContextInput, includeForm: boolean = AGENT_INCLUDE_FORM): Record<string, unknown> {
  const phase = phaseOf(snapshot);
  const answer: Record<string, unknown> = { language, product, path, title, dialogOpen: snapshot.dialogOpen, phase, submit: snapshot.submit, missing: phase === "complete" ? [] : [...snapshot.missing] };
  if (includeForm && phase === "complete") {
    answer.form = {
      requestType: snapshot.requestType,
      name: snapshot.name,
      email: snapshot.email,
      phone: snapshot.phone,
      preferredChannel: snapshot.preferredChannel,
      contactWindow: snapshot.contactWindow,
      message: snapshot.message,
      preferredSlots: snapshot.preferredSlots.map((s) => ({ ...s })),
    };
  }
  return answer;
}
