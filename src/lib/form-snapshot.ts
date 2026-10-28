import { DEFAULT_REQUEST_TYPE, type RequestType } from "./request-types";
import type { Language } from "./schema";

/**
 * What the visitor has typed into the contact form, as the page shows it to the voice assistant on request (see
 * agent-bridge.ts). A module-level value in memory and nothing else: no localStorage, no cookie, no request, no log.
 * The form model updates it on every change; the dialog (open / close) updates the flags. It is cleared only by a page
 * reload: closing the dialog, and a successful submit, leave it as it is.
 */
export const SNAPSHOT_MESSAGE_MAX = 300;

export type FormSnapshot = {
  requestType: RequestType;
  name: string;
  email: string;
  phone: string;
  preferredChannel: string;
  bestTime: string;
  /** Cut to SNAPSHOT_MESSAGE_MAX characters. */
  message: string;
  /** Only the complete rows (both a date and a time). */
  preferredSlots: { date: string; time: string }[];
  /** The page language; null until the form has mounted. */
  language: Language | null;
  consentGiven: boolean;
  /** The form would pass the same check as the submit (required fields, formats, slots). */
  valid: boolean;
  dialogOpen: boolean;
  everOpened: boolean;
};

const INITIAL: FormSnapshot = {
  requestType: DEFAULT_REQUEST_TYPE,
  name: "",
  email: "",
  phone: "",
  preferredChannel: "",
  bestTime: "",
  message: "",
  preferredSlots: [],
  language: null,
  consentGiven: false,
  valid: false,
  dialogOpen: false,
  everOpened: false,
};

let current: FormSnapshot = INITIAL;

/** A copy: a caller cannot change the stored value. */
export const getFormSnapshot = (): FormSnapshot => ({ ...current, preferredSlots: current.preferredSlots.map((s) => ({ ...s })) });

export function updateFormSnapshot(patch: Partial<FormSnapshot>): void {
  current = { ...current, ...patch, ...(patch.message !== undefined ? { message: Array.from(patch.message).slice(0, SNAPSHOT_MESSAGE_MAX).join("") } : {}) };
}

/** For tests only: a page reload does this in the browser. */
export const resetFormSnapshotForTests = (): void => {
  current = INITIAL;
};
