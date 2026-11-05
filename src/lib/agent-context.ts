import type { FormSnapshot } from "./form-snapshot";
import { formContext, valuesOf } from "./form-context";
import { EMPTY_VIEW, type PageView } from "./page-view";

/**
 * The answer to the voice assistant's page_context question. Read-only: it describes the page, it is never a way to write
 * a field. The values the visitor typed are in it ONLY in the phase "complete" (valid and consented, or already sent); in every
 * other phase the answer has no values at all.
 *
 * The shape follows the reference site's (multivan-landing), so a prompt written for it reads this page unchanged:
 *   { language, product, path, title, section, view, form: { phase, type, missing, consent, visible, submit, requestId?, values? } }
 * (form-context.ts). The keys the answer had before are still there for one release and are DEPRECATED: the top-level `dialogOpen`,
 * `phase`, `submit` and `missing` (their meanings differ a little from `form.*`: see PAGE-API.md), and the flat values inside `form`
 * (requestType, name, email, phone, preferredChannel, contactWindow, message, preferredSlots, amount). Never in it: the consent text,
 * the honeypot, the timers.
 */

/**
 * For the case where the platform ignores keys it does not know: false cuts only the values (`form.values` and the deprecated flat
 * ones). Language, section, view, dialogOpen and the whole of `form` but its values stay (they are not personal data: states and field names only).
 */
export const AGENT_INCLUDE_FORM = true;

export const PHASES = ["not_opened", "open_filling", "closed_empty", "no_consent", "incomplete", "complete"] as const;
export type Phase = (typeof PHASES)[number];

const hasValues = (s: FormSnapshot): boolean => Boolean(s.name || s.email || s.phone || s.preferredChannel || s.contactWindow !== "anytime" || s.message || s.amount || s.preferredSlots.length > 0);

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

export type PageContextInput = { language: string; product: string; path: string; title: string; snapshot: FormSnapshot; view?: PageView };

/**
 * `view` says what is on screen: { section, category, photo, index, total, spot, fullscreen } (see page-view.ts). It is in every phase and
 * holds ids and counts only; its fields are null (fullscreen false) while the gallery is not interactive or the page has none. `section` is also at the top level.
 */
export function buildPageContext({ language, product, path, title, snapshot, view }: PageContextInput, includeForm: boolean = AGENT_INCLUDE_FORM): Record<string, unknown> {
  const legacyPhase = phaseOf(snapshot);
  const shownView = { ...(view ?? EMPTY_VIEW) };
  const form = formContext(snapshot, includeForm);
  // deprecated, kept for one release: the values flat in `form`, as the old top-level `form` had them (only when the new phase says complete)
  if (includeForm && form.phase === "complete") {
    Object.assign(form, {
      requestType: snapshot.requestType,
      name: snapshot.name,
      email: snapshot.email,
      phone: snapshot.phone,
      preferredChannel: snapshot.preferredChannel,
      contactWindow: snapshot.contactWindow,
      message: snapshot.message,
      preferredSlots: snapshot.preferredSlots.map((s) => ({ ...s })),
      ...(snapshot.requestType === "offer" ? { amount: valuesOf(snapshot).amount } : {}),
    });
  }
  return {
    language,
    product,
    path,
    title,
    section: shownView.section ?? null,
    view: shownView,
    form,
    // deprecated top-level keys of the first version of the answer
    dialogOpen: snapshot.dialogOpen,
    phase: legacyPhase,
    submit: snapshot.submit,
    missing: legacyPhase === "complete" ? [] : [...snapshot.missing],
  };
}
