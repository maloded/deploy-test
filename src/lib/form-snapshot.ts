import type { LeadField } from "./lead";
import { DEFAULT_REQUEST_TYPE, type RequestType } from "./request-types";
import type { Language } from "./schema";

/**
 * What the visitor has typed into the contact form, as the page shows it to the voice assistant on request (see
 * agent-bridge.ts). A module-level value in memory and nothing else: no localStorage, no cookie, no request, no log.
 * The form model updates it on every change; the dialog (open / close) updates the flags. It is cleared only by a page
 * reload: closing the dialog, and a successful submit, leave it as it is (a successful submit freezes the values until the
 * visitor edits a field).
 */
export const SNAPSHOT_MESSAGE_MAX = 300;

/** Whether the request reached the seller: the lead API answered success ("sent"), or did not ("failed"); "none" until a send ends, and again after the visitor edits a field. */
export type SubmitState = "none" | "sent" | "failed";

export type FormSnapshot = {
  requestType: RequestType;
  name: string;
  email: string;
  phone: string;
  preferredChannel: string;
  /** The code of the contact window ("anytime" by default; always "anytime" for an e-mail channel). */
  contactWindow: string;
  /** Cut to SNAPSHOT_MESSAGE_MAX characters. */
  message: string;
  /** Only the complete rows (both a date and a time). */
  preferredSlots: { date: string; time: string }[];
  /** The page language; null until the form has mounted. */
  language: Language | null;
  consentGiven: boolean;
  /** The form would pass the same check as the submit (required fields, formats, slots). */
  valid: boolean;
  /** The NAMES of the fields that block the form (page order); never values. Empty when valid. */
  missing: LeadField[];
  dialogOpen: boolean;
  everOpened: boolean;
  submit: SubmitState;
};

const INITIAL: FormSnapshot = {
  requestType: DEFAULT_REQUEST_TYPE,
  name: "",
  email: "",
  phone: "",
  preferredChannel: "",
  contactWindow: "anytime",
  message: "",
  preferredSlots: [],
  language: null,
  consentGiven: false,
  valid: false,
  missing: ["name", "email", "consent"],
  dialogOpen: false,
  everOpened: false,
  submit: "none",
};

let current: FormSnapshot = INITIAL;

/** A copy: a caller cannot change the stored value. */
export const getFormSnapshot = (): FormSnapshot => ({ ...current, preferredSlots: current.preferredSlots.map((s) => ({ ...s })), missing: [...current.missing] });

export function updateFormSnapshot(patch: Partial<FormSnapshot>): void {
  current = { ...current, ...patch, ...(patch.message !== undefined ? { message: Array.from(patch.message).slice(0, SNAPSHOT_MESSAGE_MAX).join("") } : {}) };
}

/** For tests only: a page reload does this in the browser. */
export const resetFormSnapshotForTests = (): void => {
  current = INITIAL;
};
